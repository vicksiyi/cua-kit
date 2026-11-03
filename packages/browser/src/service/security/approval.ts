import { AuthorityGateError } from "../errors/authority_gate_error";
import {
  BrowserUseSecurityError,
  type BrowserSecurityReason,
} from "../errors/browser_security_error";
import {
  isGuardianReviewed,
  guardianReviewTimedOut,
  type ApprovalResult,
} from "../preferences/prompt_results";

type Audit = Record<string, any>;
type GateAudit = Audit & { gate: string };
type DisplayOptions = {
  browserBackend?: string;
  browserFamily?: string;
  elicitationDisplayName?: string;
};
export function browserDisplayName(options?: DisplayOptions) {
  return options?.elicitationDisplayName ?? "Browser use";
}
/** Original ba tolerates malformed metadata without hiding later action access errors. */
export function safelyGuardianReviewed(result: ApprovalResult) {
  try {
    return isGuardianReviewed(true, result);
  } catch {
    return false;
  }
}
export function savedPermissionApproval(
  audit: GateAudit,
  permission:
    { decision: string; source: string; scope?: unknown } | null | undefined,
) {
  if (permission != null) {
    if (permission.decision === "deny")
      throw new AuthorityGateError(
        audit.gate,
        permission.source === "codex-network-policy"
          ? "enterprise_policy_blocked"
          : permission.source === "codex-history-policy"
            ? "browser_capability_blocked"
            : "persisted_user_denied",
        "A saved permission or managed policy denies access.",
        { ...audit, source: permission.source },
      );
    return {
      ...audit,
      source: permission.source,
      reused: true,
      scope: permission.scope,
    };
  }
}
export function approvalDecision(
  audit: GateAudit,
  result: ApprovalResult,
  defaultSource = "user_decision",
) {
  const source = safelyGuardianReviewed(result)
    ? "guardian-auto-review"
    : defaultSource;
  let message: string | undefined,
    timedOut = false;
  try {
    if (
      source === "guardian-auto-review" &&
      typeof result._meta?.message === "string"
    )
      message = result._meta.message;
    timedOut = guardianReviewTimedOut(result);
  } catch {}
  switch (result.action) {
    case "accept":
      return { ...audit, source, reused: false };
    case "decline":
      throw new AuthorityGateError(
        audit.gate,
        source === "guardian-auto-review"
          ? timedOut
            ? "guardian_timed_out"
            : "guardian_denied"
          : "user_declined",
        message ??
          (source === "guardian-auto-review"
            ? timedOut
              ? "The approval review timed out."
              : "The approval reviewer denied access."
            : "The user declined approval."),
        { ...audit, source },
      );
    case "cancel":
      throw new AuthorityGateError(
        audit.gate,
        "approval_cancelled",
        "The approval request was cancelled.",
        audit,
      );
    default:
      throw new AuthorityGateError(
        audit.gate,
        "approval_failed_closed",
        "The approval request did not return a valid decision.",
        audit,
      );
  }
}
interface CheckContext {
  audit?: Audit;
  check: string;
  options?: DisplayOptions;
  errorMessage: string;
}
interface FailureContext {
  audit?: Audit;
  check: string;
  durationMs?: number;
  options?: DisplayOptions;
  permissionSource?: string;
  reason: BrowserSecurityReason;
}
type Elicitation = (request: any) => any;
/** Original AB/CB and PB/RB/IB/hf/kB/ho/tr. Shared production instance below. */
export function createApprovalRuntime() {
  const durations = new WeakMap<object, number>();
  let auditSink: ((record: Audit) => unknown) | undefined;
  function recordDuration(result: object, duration: number) {
    durations.set(result, duration);
  }
  function approvalDuration(result: object) {
    return durations.get(result);
  }
  function setAuditSink(sink: ((record: Audit) => unknown) | undefined) {
    auditSink = sink;
  }
  function emitAudit(build: () => Audit) {
    try {
      const pending = auditSink?.(build());
      if (pending != null) Promise.resolve(pending).catch(() => {});
    } catch {}
  }
  function recordSuccess(
    check: string,
    options?: DisplayOptions,
    permissionSource?: string,
    audit?: Audit,
    durationMs?: number,
  ) {
    emitAudit(() => ({
      ...audit,
      backend: options?.browserBackend,
      browserFamily: options?.browserFamily,
      check,
      durationMs,
      outcome: "success",
      permissionSource,
    }));
  }
  function failCheck(
    {
      audit,
      check,
      durationMs,
      options,
      permissionSource,
      reason,
    }: FailureContext,
    message: string,
    cause?: unknown,
  ): never {
    const error = new BrowserUseSecurityError(
      reason,
      message,
      cause === undefined ? undefined : { cause },
    );
    emitAudit(() => ({
      ...audit,
      backend: options?.browserBackend,
      browserFamily: options?.browserFamily,
      check,
      durationMs,
      outcome: error.retryable ? "error_fail_closed" : "denied",
      permissionSource,
      reason,
    }));
    throw error;
  }
  function createElicitation(
    getElicitation: () => Elicitation | null | undefined,
    context: GateAudit | CheckContext,
  ) {
    const fail = (
      reason: "approval_unavailable" | "approval_failed_closed",
      cause?: unknown,
    ): never => {
      if ("gate" in context)
        throw new AuthorityGateError(
          context.gate,
          reason,
          reason === "approval_unavailable"
            ? "Approval is unavailable in this context."
            : "The approval request did not return a valid decision.",
          context,
          { cause },
        );
      const { audit, check, options, errorMessage } = context;
      return failCheck({ audit, check, options, reason }, errorMessage, cause);
    };
    let elicitation;
    try {
      elicitation = getElicitation();
    } catch (error) {
      fail("approval_unavailable", error);
    }
    if (elicitation == null) fail("approval_unavailable");
    return async (request: any) => {
      let result: any;
      const start = performance.now();
      try {
        result = await elicitation!(request);
        recordDuration(
          result,
          Math.round(Math.max(0, performance.now() - start)),
        );
      } catch (error) {
        fail("approval_failed_closed", error);
      }
      switch (result?.action) {
        case "accept":
        case "decline":
        case "cancel":
          return result as ApprovalResult;
        default:
          return fail("approval_failed_closed");
      }
    };
  }
  return {
    recordDuration,
    approvalDuration,
    setAuditSink,
    emitAudit,
    recordSuccess,
    failCheck,
    createElicitation,
  };
}
export const approvalRuntime = createApprovalRuntime();
