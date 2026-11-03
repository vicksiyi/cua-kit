import {
  permissionTableKey,
  approvalModeKey,
  readPermissionSnapshot,
  approvalMode,
  permissionTable,
  permissionTarget,
  tableMatchesPermission,
  validPreferenceSession,
} from "./persisted_permissions";
import { guardianOriginCache } from "./guardian_cache";
import { preferenceTurnCaches } from "./turn_caches";
import {
  accessApprovalLifetime,
  type ApprovalRequest,
  type PreferenceConfig,
} from "./prompt_results";
export interface PermissionDecision {
  decision: "approve" | "deny";
  scope: "global" | "conversation" | "turn";
  source:
    | "browser-use-persisted-state"
    | "guardian-origin-cache"
    | "browser-use-turn-cache";
}
interface PreferenceOwner {
  config: PreferenceConfig;
  isPersistentApprovalAllowed(origin: string): Promise<boolean>;
  isAutoReviewDisabled(): Promise<boolean>;
  isOriginAutoReviewDisabled(origin: string): Promise<boolean>;
  allowsGlobalPersistentApproval(): Promise<boolean>;
}
/** Original lu.maybeAutoAnswerBrowserUseRequest. Preserve read order and the second guardian lookup after asynchronous policy checks. */
export function createAutoAnswerMethod(
  guardian = guardianOriginCache,
  turns = preferenceTurnCaches,
) {
  return async function maybeAutoAnswerBrowserUseRequest(
    this: PreferenceOwner,
    request: ApprovalRequest,
  ): Promise<PermissionDecision | null> {
    let globalDenial: PermissionDecision | null = null;
    const persistentAllowed = await this.isPersistentApprovalAllowed(
      request.resource.origin,
    );
    const tableKey = permissionTableKey(request.resource),
      modeKey = approvalModeKey(request.resource);
    const refresh =
      request.resource.kind === "origin" && request.guardianMode === "v2";
    const global = await readPermissionSnapshot(
      this.config.global,
      [
        ...(modeKey == null ? [] : [modeKey]),
        ...(tableKey == null ? [] : [tableKey]),
      ],
      refresh,
    );
    const mode = approvalMode(global, request.resource),
      globalTable = permissionTable(global, tableKey),
      target = permissionTarget(request.resource);
    if (
      globalTable != null &&
      tableMatchesPermission(globalTable, "denied", target)
    )
      globalDenial = {
        decision: "deny",
        scope: "global",
        source: "browser-use-persisted-state",
      };
    const session =
      tableKey == null || !validPreferenceSession(request.preferenceSessionId)
        ? {}
        : await readPermissionSnapshot(
            this.config.session(request.preferenceSessionId),
            [tableKey],
            refresh,
          );
    const sessionTable = permissionTable(session, tableKey);
    turns.invalidateGuardianApproval(request);
    if (
      sessionTable != null &&
      tableMatchesPermission(sessionTable, "denied", target)
    )
      return {
        decision: "deny",
        scope: "conversation",
        source: "browser-use-persisted-state",
      };
    if (globalDenial != null) return globalDenial;
    if (turns.hasGuardianApproval(request))
      return {
        decision: "approve",
        scope: "turn",
        source: "guardian-origin-cache",
      };
    if (
      request.guardianMode === "v2" &&
      request.guardianOrigin != null &&
      guardian.get(request.guardianOrigin) != null &&
      global.disable_auto_review !== true &&
      !(await this.isAutoReviewDisabled()) &&
      !(await this.isOriginAutoReviewDisabled(request.resource.origin)) &&
      guardian.get(request.guardianOrigin) != null
    )
      return {
        decision: "approve",
        scope: "conversation",
        source: "guardian-origin-cache",
      };
    if (turns.hasTurnApproval(request))
      return {
        decision: "approve",
        scope: "turn",
        source: "browser-use-turn-cache",
      };
    if (
      sessionTable != null &&
      tableMatchesPermission(sessionTable, "allowed", target) &&
      (request.resource.kind !== "origin" ||
        (await accessApprovalLifetime(request.resource.origin, this.config)) ===
          "thread")
    )
      return {
        decision: "approve",
        scope: "conversation",
        source: "browser-use-persisted-state",
      };
    if (
      persistentAllowed &&
      globalTable != null &&
      tableMatchesPermission(globalTable, "allowed", target)
    )
      return {
        decision: "approve",
        scope: "global",
        source: "browser-use-persisted-state",
      };
    if (
      mode === "never_ask" &&
      persistentAllowed &&
      (await this.allowsGlobalPersistentApproval())
    )
      return {
        decision: "approve",
        scope: "global",
        source: "browser-use-persisted-state",
      };
    return null;
  };
}
export const maybeAutoAnswerBrowserUseRequest = createAutoAnswerMethod();
