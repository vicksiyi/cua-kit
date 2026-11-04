import { guardianReviewTimedOut } from "../preferences/prompt_results";
type Attributes = Record<string, string | boolean | undefined>;
export type ElicitationSpan = (
  name: string,
  attributes: Attributes,
  perform: () => Promise<any>,
  options: { resultAttrs(result: any): Attributes },
) => Promise<any>;
/** Original G6: distinguishes guardian review from user waiting and projects only approved metadata fields. */
export function createElicitationTelemetry(withSpan: ElicitationSpan) {
  return async function trackElicitation(
    request: any,
    perform: () => Promise<any>,
  ) {
    const automaticReview =
      request.meta?.codex_request_type === "approval_request";
    const authentication =
      request.meta?.codex_approval_kind === "browser_auth" ||
      request.meta?.codex_approval_kind === "browser_email_otp";
    return await withSpan(
      automaticReview
        ? "browser_use.guardian.evaluate"
        : "browser_use.elicitation.wait",
      {
        "browser_use.approval.automatic_review_requested": automaticReview,
        "browser_use.auth.stage": authentication ? "elicitation" : undefined,
      },
      perform,
      {
        resultAttrs(result) {
          const reviewer = result._meta?.approvals_reviewer;
          return {
            "browser_use.auth.reason": authentication
              ? result._meta?.["openai/client_unsupported"] === true
                ? "client_unsupported"
                : result._meta?.["openai/user_took_over"] === true
                  ? "user_took_over"
                  : undefined
              : undefined,
            "browser_use.approval.reviewer":
              reviewer === "guardian_subagent" || reviewer === "auto_review"
                ? "guardian"
                : reviewer == null || reviewer === "user"
                  ? "user"
                  : "unknown",
            "browser_use.approval.outcome": guardianReviewTimedOut(result)
              ? "timed_out"
              : result.action === "accept" ||
                  result.action === "decline" ||
                  result.action === "cancel"
                ? result.action
                : "invalid_response",
          };
        },
      },
    );
  };
}
