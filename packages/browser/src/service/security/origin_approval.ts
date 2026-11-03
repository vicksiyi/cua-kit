import type { Preferences } from "../preferences/preferences";
import {
  guardianOriginCache,
  type GuardianApproval,
  type GuardianReview,
} from "../preferences/guardian_cache";
import type { ApprovalResult } from "../preferences/prompt_results";
import { AuthorityGateError } from "../errors/authority_gate_error";
import { httpOrigin } from "./authority_builder";
import {
  approvalRuntime,
  approvalDecision,
  savedPermissionApproval,
  safelyGuardianReviewed,
  browserDisplayName,
} from "./approval";

type OriginPreferences = Pick<
  Preferences,
  | "captureOriginRequestContext"
  | "getOriginPermission"
  | "isOriginBlockedByPolicy"
  | "isAutoReviewDisabled"
  | "isOriginAutoReviewDisabled"
  | "isPersistentApprovalAllowed"
  | "handleOriginPromptResult"
>;
type Getter = Parameters<typeof approvalRuntime.createElicitation>[0];
interface CommandTiming {
  trackElicitation<T extends (...args: any[]) => any>(fn: T): T;
}
/** Original OB; shared default timing adapter, no background work. */
export const noCommandTiming = {
  startCommand() {
    return {
      finish() {},
      async run<T>(fn: () => T | Promise<T>) {
        return await fn();
      },
    };
  },
  startLocatorRetry() {
    return { attemptFailed() {}, finish() {} };
  },
  trackElicitation<T extends (...args: any[]) => any>(fn: T) {
    return fn;
  },
};
interface ReviewOptions {
  autoReviewDisabled: boolean;
  persistentApprovalAllowed: boolean;
}
interface ReviewDecision {
  result: ApprovalResult;
  approval: GuardianApproval | undefined;
}
interface RequestState {
  getCreateElicitation: Getter;
  origin: string;
  preferences: OriginPreferences;
  commandTiming: CommandTiming;
  context: ReturnType<Preferences["captureOriginRequestContext"]>;
  browserName: string;
  audit: { origin: string | undefined };
}
/** Original NB. */
export async function assertOriginPolicy(
  origin: string,
  preferences: OriginPreferences,
) {
  if (await preferences.isOriginBlockedByPolicy(origin, "access"))
    throw new AuthorityGateError(
      "originPolicy",
      "enterprise_policy_blocked",
      "Managed policy blocks access to this origin.",
      { origin, source: "codex-network-policy" },
    );
}
/** Original FB/HB/kX/MB/BX/gf: preparation, shared review and post-review revalidation. */
export function createOriginApproval(
  runtime = approvalRuntime,
  guardian = guardianOriginCache,
) {
  async function autoReviewDisabled(state: RequestState) {
    return (
      (await state.preferences.isAutoReviewDisabled()) ||
      (await state.preferences.isOriginAutoReviewDisabled(state.origin))
    );
  }
  function checkPermission(
    state: RequestState,
    permission: Awaited<ReturnType<Preferences["getOriginPermission"]>>,
  ) {
    savedPermissionApproval(
      { gate: "originApproval", ...state.audit },
      permission,
    );
  }
  async function requestReview(
    state: RequestState,
    options: ReviewOptions,
    review?: GuardianReview,
  ) {
    const result = await runtime.createElicitation(state.getCreateElicitation, {
      gate: "originApproval",
      ...state.audit,
    })({
      message: `Allow ${state.browserName} to access ${state.origin}?`,
      meta: {
        codex_approval_kind: "mcp_tool_call",
        codex_sensitive_action: true,
        ...(options.autoReviewDisabled
          ? {}
          : { codex_request_type: "approval_request" }),
        connector_id: "browser-use",
        connector_name: state.browserName,
        persist: options.persistentApprovalAllowed ? "always" : undefined,
        tool_name: "access_browser_origin",
        tool_title: "Access browser origin",
        tool_params: { origin: state.origin },
        tool_params_display: [],
        origin: state.origin,
      },
    });
    if (
      state.context.guardianMode === "v2" &&
      !options.autoReviewDisabled &&
      state.context.guardianOrigin != null &&
      result.action === "accept" &&
      !safelyGuardianReviewed(result)
    )
      checkPermission(
        state,
        await state.preferences.getOriginPermission(
          state.origin,
          state.context,
        ),
      );
    await state.preferences.handleOriginPromptResult(
      state.origin,
      result,
      state.context,
      {
        guardianReview: review,
        guardianReviewRequested: !options.autoReviewDisabled,
      },
    );
    return result;
  }
  async function beginReview(
    state: RequestState,
    options: ReviewOptions,
    observed: GuardianApproval | undefined,
  ): Promise<ReviewDecision | undefined> {
    const origin =
      state.context.guardianMode === "v2" && !options.autoReviewDisabled
        ? state.context.guardianOrigin
        : undefined;
    if (origin == null)
      return {
        result: await requestReview(state, options),
        approval: undefined,
      };
    const review = guardian.start(origin, observed, (token) =>
      requestReview(state, options, token),
    );
    if (review.kind === "retry") return;
    if (!review.shared) return review.decision as Promise<ReviewDecision>;
    const decision = await state.commandTiming.trackElicitation(
      (pending: Promise<ReviewDecision>) => pending,
    )(review.decision as Promise<ReviewDecision>);
    return decision.result.action === "cancel" ||
      safelyGuardianReviewed(decision.result)
      ? decision
      : undefined;
  }
  async function stillApproved(
    state: RequestState,
    decision: ReviewDecision,
    options: ReviewOptions,
  ) {
    if (
      state.context.guardianMode === "v1" ||
      decision.result.action !== "accept"
    )
      return true;
    const reviewed = safelyGuardianReviewed(decision.result);
    if (
      !reviewed &&
      (options.autoReviewDisabled || state.context.guardianOrigin == null)
    )
      return true;
    checkPermission(
      state,
      await state.preferences.getOriginPermission(state.origin, state.context),
    );
    if (!reviewed || options.autoReviewDisabled) return true;
    if (await autoReviewDisabled(state)) return false;
    return (
      state.context.guardianOrigin == null ||
      (decision.approval != null &&
        guardian.get(state.context.guardianOrigin) === decision.approval)
    );
  }
  async function prepare(
    getElicitation: Getter,
    origin: string,
    preferences: OriginPreferences,
    display: Parameters<typeof browserDisplayName>[0] = {},
    commandTiming: CommandTiming = noCommandTiming,
    bypass = false,
  ) {
    const state: RequestState = {
      getCreateElicitation: getElicitation,
      origin,
      preferences,
      commandTiming,
      context: preferences.captureOriginRequestContext(origin),
      browserName: browserDisplayName(display),
      audit: { origin: httpOrigin(origin) ?? undefined },
    };
    const initial = await preferences.getOriginPermission(
      origin,
      state.context,
    );
    checkPermission(state, initial);
    return bypass
      ? async () => {}
      : async () => {
          for (;;) {
            const observed = guardian.get(state.context.guardianOrigin),
              permission = await preferences.getOriginPermission(
                origin,
                state.context,
              );
            if (permission?.decision === "approve") {
              if (
                state.context.guardianMode === "v2" &&
                permission.source === "guardian-origin-cache" &&
                (observed == null ||
                  guardian.get(state.context.guardianOrigin) !== observed)
              )
                continue;
              return savedPermissionApproval(
                { gate: "originApproval", ...state.audit },
                permission,
              );
            }
            checkPermission(state, permission);
            const options = {
              autoReviewDisabled: await autoReviewDisabled(state),
              persistentApprovalAllowed:
                await preferences.isPersistentApprovalAllowed(origin),
            };
            const decision = await beginReview(state, options, observed);
            if (
              decision != null &&
              (await stillApproved(state, decision, options))
            )
              return approvalDecision(
                { gate: "originApproval", ...state.audit },
                decision.result,
              );
          }
        };
  }
  return { prepare };
}
export const originApproval = createOriginApproval();
