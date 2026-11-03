import {
  ConfigReadError,
  isUserReviewed,
  canPersistResource,
  promptPersistence,
  defaultsToConversation,
  promptApprovesAllSites,
  persistPermission,
  type PermissionTableStore,
} from "./persisted_permissions";
import { readOriginPolicy } from "./origin_policy";
import {
  guardianOriginCache,
  type GuardianOrigin,
  type GuardianReview,
} from "./guardian_cache";
import {
  preferenceTurnCaches,
  type CachedPermissionRequest,
} from "./turn_caches";
import type { Requirements, ConfigSnapshot } from "./network_config";
export interface ApprovalResult {
  action: string;
  _meta?: Record<string, any>;
  content?: unknown;
}
export interface ApprovalRequest extends CachedPermissionRequest {
  guardianOrigin?: GuardianOrigin;
  guardianReview?: GuardianReview;
  guardianReviewRequested?: boolean;
}
export interface PreferenceConfig {
  global: PermissionTableStore & {
    set(key: string, value: unknown): Promise<unknown>;
  };
  session(id: string): PermissionTableStore;
  readRequirements(): Promise<Requirements | null | undefined>;
  readAll(): Promise<ConfigSnapshot | null | undefined>;
}
const guardianTimeoutMessage =
  "The automatic permission approval review did not finish before its deadline. Do not assume the action is unsafe based on the timeout alone. You may retry once, or ask the user for guidance or explicit approval.";
export function isGuardianReviewed(enabled: boolean, result: ApprovalResult) {
  if (!enabled) return false;
  const reviewer = result._meta?.approvals_reviewer;
  return reviewer === "guardian_subagent" || reviewer === "auto_review";
}
export function guardianReviewTimedOut(result: ApprovalResult) {
  if (result.action !== "decline" || !isGuardianReviewed(true, result))
    return false;
  const message = result._meta?.message;
  return (
    typeof message === "string" &&
    message.trim().replace(/[ \t\r\n]+/g, " ") === guardianTimeoutMessage
  );
}
export async function persistentApprovalAllowed(
  origin: string,
  config: PreferenceConfig,
) {
  return (await readOriginPolicy(origin, config)).persistentApproval;
}
export async function globalPersistentApprovalAllowed(
  config: PreferenceConfig,
) {
  const requirements = await config.readRequirements();
  return (
    requirements?.requirements?.browserUse?.allowGlobalPersistentApproval !==
    false
  );
}
export async function accessApprovalLifetime(
  origin: string,
  config: PreferenceConfig,
) {
  return (await readOriginPolicy(origin, config)).accessApprovalLifetime;
}
/** Original gS/Yoe. Cache dependencies are shared defaults, replaceable for isolated tests. */
export function createPromptResultHandler(
  guardian = guardianOriginCache,
  turns = preferenceTurnCaches,
) {
  async function persistUserResult(
    request: ApprovalRequest,
    result: ApprovalResult,
    config: PreferenceConfig,
  ) {
    const decision =
      result.action === "accept"
        ? "approve"
        : result.action === "decline"
          ? "deny"
          : null;
    if (decision == null || !canPersistResource(request.resource)) return;
    let scope =
      promptPersistence(result) ??
      (defaultsToConversation(request.resource) ? "conversation" : null);
    if (scope == null) return;
    const allSites =
      request.resource.kind === "origin" && promptApprovesAllSites(result);
    if (
      decision === "approve" &&
      scope === "global" &&
      (!(await persistentApprovalAllowed(request.resource.origin, config)) ||
        (allSites && !(await globalPersistentApprovalAllowed(config))))
    )
      scope = defaultsToConversation(request.resource) ? "conversation" : null;
    if (scope != null) {
      if (
        request.resource.kind === "origin" &&
        decision === "approve" &&
        scope === "conversation"
      ) {
        const lifetime = await accessApprovalLifetime(
          request.resource.origin,
          config,
        );
        if (lifetime == null) return;
        if (lifetime === "turn") {
          turns.recordTurnApproval(request.resource.origin, request.turn);
          return;
        }
      }
      try {
        if (decision === "approve" && scope === "global" && allSites)
          await config.global.set("approval_mode", "never_ask");
        else await persistPermission(config, request, scope, decision);
      } catch (error) {
        if (error instanceof ConfigReadError) throw error;
      }
    }
  }
  async function handlePromptResult(
    request: ApprovalRequest,
    result: ApprovalResult,
    config: PreferenceConfig,
  ) {
    let userReviewed;
    try {
      if (isGuardianReviewed(true, result)) {
        if (result.action === "accept") {
          if (request.guardianMode === "v1")
            turns.recordGuardianApproval(request);
          else if (
            request.guardianMode === "v2" &&
            request.guardianOrigin != null &&
            request.guardianReviewRequested !== false
          )
            guardian.record(request.guardianOrigin, request.guardianReview);
        } else if (
          request.guardianOrigin != null &&
          request.guardianReviewRequested !== false &&
          request.guardianReview?.revoked !== true &&
          result.action === "decline" &&
          !guardianReviewTimedOut(result)
        )
          guardian.revoke(request.guardianOrigin);
        return;
      }
      userReviewed = isUserReviewed(result);
      if (
        userReviewed &&
        result.action === "decline" &&
        request.guardianOrigin != null
      )
        guardian.revoke(request.guardianOrigin);
    } catch {
      return;
    }
    if (userReviewed) await persistUserResult(request, result, config);
  }
  return { handlePromptResult, persistUserResult };
}
export const promptResultHandler = createPromptResultHandler();
