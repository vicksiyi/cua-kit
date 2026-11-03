import { securityMode } from "../security/gate_policy";
import { approvalRuntime, browserDisplayName } from "../security/approval";
import {
  isGuardianReviewed,
  guardianReviewTimedOut,
} from "../preferences/prompt_results";
import { failAuthSafetyReview } from "./safety_review";
const securityKey = "BROWSER_USE_SECURITY_MODE",
  enabledKey = "BROWSER_USE_AUTOMATED_SAFETY_PRECHECKS_ENABLED";
/** Original Uy/ci/bp/qy. First host owns the registry until its disposer runs. */
export function createAutomatedReviewHostRegistry() {
  let host: any;
  function register(runtime: any) {
    if (host != null) return () => {};
    const captured = Object.freeze({
      createElicitation: runtime.createElicitation,
      env: runtime.env,
      securityMode: runtime.env[securityKey],
      enabled: runtime.env[enabledKey] === "1",
    });
    host = captured;
    return () => {
      if (host === captured) host = undefined;
    };
  }
  function current() {
    return host;
  }
  function matches(runtime: any) {
    const captured = host;
    return captured == null
      ? true
      : runtime.env === captured.env &&
          runtime.env[securityKey] === captured.securityMode &&
          (runtime.env[enabledKey] === "1") === captured.enabled;
  }
  function enabled(runtime: any) {
    const captured = host;
    return captured != null
      ? captured.securityMode?.trim() === "gaas-browser-environment" &&
          captured.enabled
      : securityMode(runtime) === "gaas-browser-environment" &&
          runtime.env[enabledKey] === "1";
  }
  return { register, current, matches, enabled };
}
export const automatedReviewHosts = createAutomatedReviewHostRegistry();
/** Original QB/eD. Recheck immutable host/environment binding at invocation time. */
export function createAutomatedAuthPrecheck(
  runtime: any,
  timing: any,
  options: any = {},
  hosts = automatedReviewHosts,
) {
  if (!hosts.enabled(runtime)) return;
  const name = browserDisplayName(options),
    host = hosts.current();
  const elicit = approvalRuntime.createElicitation(
    () => {
      if (host == null) {
        if (typeof runtime.createElicitation !== "function")
          throw new Error("Browser security elicitation is unavailable");
        return timing.trackElicitation(runtime.createElicitation);
      }
      return hosts.matches(runtime)
        ? timing.trackElicitation(host.createElicitation)
        : undefined;
    },
    {
      check: "automated-safety-precheck",
      errorMessage: `Auto-review could not complete the required safety review for this ${name} action.`,
      options,
    },
  );
  return async ({ message, toolName, toolParams }: any) => {
    if (!hosts.enabled(runtime) || !hosts.matches(runtime))
      failAuthSafetyReview(
        "approval_unavailable",
        `The required auto-review functionality for this ${name} feature is not supported in this environment.`,
        options,
      );
    if (!toolName.trim())
      throw new Error("Auto-review safety precheck requires a tool name");
    const result = await elicit({
      message,
      requestedSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      meta: {
        codex_request_type: "approval_request",
        codex_approval_kind: "mcp_tool_call",
        codex_strict_auto_review: true,
        codex_sensitive_action: true,
        connector_id: "browser-use",
        connector_name: name,
        tool_name: `automated_safety_precheck.${toolName.trim()}`,
        tool_description: message,
        tool_params: toolParams,
      },
    });
    const duration = approvalRuntime.approvalDuration(result),
      action = result.action,
      reviewer = result._meta?.approvals_reviewer,
      reviewed = isGuardianReviewed(true, result);
    if (action === "accept" && reviewed) {
      approvalRuntime.recordSuccess(
        "automated-safety-precheck",
        options,
        "guardian-auto-review",
        undefined,
        duration,
      );
      return result;
    }
    const denied = action === "decline" && (reviewed || reviewer == null),
      timedOut = guardianReviewTimedOut(result),
      provided = result._meta?.message;
    const explanation =
      typeof provided === "string" && provided.trim()
        ? provided
        : "Auto-review did not grant approval for this browser action.";
    failAuthSafetyReview(
      timedOut
        ? "guardian_timed_out"
        : denied
          ? "guardian_denied"
          : action === "cancel" && reviewed
            ? "approval_cancelled"
            : "approval_failed_closed",
      denied
        ? explanation
        : "Auto-review did not return a valid safety approval for this action.",
      options,
      undefined,
      denied ? duration : undefined,
    );
  };
}
