import { approvalRuntime, browserDisplayName } from "../security/approval";
import { captureReviewerVisibleDom } from "../input/visible_dom";

/** Original _a: preserve structured approval audit and cause. */
export function failAuthSafetyReview(
  reason: Parameters<typeof approvalRuntime.failCheck>[0]["reason"],
  message: string,
  options: any = {},
  cause?: unknown,
  durationMs?: number,
): never {
  return approvalRuntime.failCheck(
    {
      check: "automated-safety-precheck",
      durationMs,
      options,
      ...(reason === "guardian_denied" || reason === "guardian_timed_out"
        ? { permissionSource: "guardian-auto-review" }
        : {}),
      reason,
    },
    `${message} ${browserDisplayName(options)} stopped before creating a user prompt or action.`,
    cause,
  );
}
/** Original TY/$_: a changed prompt is a structured safety failure, not a status return. */
export async function revalidateAuthSafety(
  checkpoint: any,
  context: any,
  forReview = false,
) {
  const status = forReview
    ? await checkpoint.revalidateForReview()
    : await checkpoint.revalidate();
  if (status === "prompt_changed")
    failAuthSafetyReview(
      "browser_context_unavailable",
      "The reviewed credential field labels changed or an authentication control changed during the authentication process.",
      {
        browserBackend: context.clientInfo.type,
        elicitationDisplayName: context.elicitationDisplayName,
      },
    );
  return status;
}
export interface AuthSafetyDependencies {
  /** Original wf; host documentation environment/packaging must be supplied. */
  readDocumentation(
    name: string,
    filesystem: any,
    options: { environment: any },
  ): Promise<string>;
  captureVisibleDom?: typeof captureReviewerVisibleDom;
}
export function createAuthSafetyReview(dependencies: AuthSafetyDependencies) {
  const captureVisibleDom =
    dependencies.captureVisibleDom ?? captureReviewerVisibleDom;
  /** Original EY, including required authentication-frame presence. */
  async function captureAuthSafetySnapshot(
    params: any,
    context: any,
    checkpoint: any,
    frameId: string,
  ) {
    let snapshot: string | undefined, cause: unknown;
    try {
      const frames = new Set<string>();
      const locator = {
        browser_id: params.browser_id,
        tab_id: params.tab_id,
        timeout_ms: params.timeout_ms,
      };
      snapshot = await captureVisibleDom(locator, context, frameId, frames);
      if (!frames.has(frameId))
        throw new Error(
          "The authentication frame was missing from the visible DOM",
        );
    } catch (error) {
      cause = error;
      snapshot = undefined;
    }
    if (!snapshot?.trim()) {
      const status = await revalidateAuthSafety(checkpoint, context, true);
      if (status != null) return { status };
      failAuthSafetyReview(
        "browser_context_unavailable",
        `${browserDisplayName(context)} could not capture the page content required for safety review.`,
        {
          browserBackend: context.clientInfo.type,
          elicitationDisplayName: context.elicitationDisplayName,
        },
        cause,
      );
    }
    const status = await revalidateAuthSafety(checkpoint, context, true);
    return status == null ? snapshot : { status };
  }
  /** Original ID. Review and screenshot validation settle together; review rejection wins. */
  async function reviewAuthSafety({
    actionTargets,
    captureScreenshotAndValidateLocators,
    checkpoint,
    credentialFieldMetadata,
    credentialFrameId,
    credentialFrameOrigin,
    createAutomatedSafetyPrecheck,
    ctx,
    params,
    proposedUserPrompt,
  }: any) {
    let instructions: string;
    try {
      instructions = (
        await dependencies.readDocumentation(
          "browserAuthSafetyPrecheck",
          ctx.filesystem,
          { environment: ctx.environment },
        )
      ).trim();
      if (!instructions)
        throw new Error("Browser auth safety precheck instructions are empty.");
    } catch (error) {
      failAuthSafetyReview(
        "approval_unavailable",
        `${browserDisplayName(ctx)} encountered an error loading safety instructions to check if it is safe to request credentials for this site.`,
        {
          browserBackend: ctx.clientInfo.type,
          elicitationDisplayName: ctx.elicitationDisplayName,
        },
        error,
      );
    }
    const snapshot = await captureAuthSafetySnapshot(
      params,
      ctx,
      checkpoint,
      credentialFrameId,
    );
    if (typeof snapshot !== "string") return snapshot.status;
    const review = createAutomatedSafetyPrecheck({
      message: instructions,
      toolName: "review_browser_auth_safety",
      toolParams: {
        proposed_user_prompt: proposedUserPrompt,
        visible_browser_state: {
          action_targets: {
            options: actionTargets.options.map(
              ({ id, accessible_name, origin }: any) => ({
                id,
                accessible_name,
                origin,
              }),
            ),
            ...(actionTargets.submit == null
              ? {}
              : {
                  submit: {
                    action: actionTargets.submit.action,
                    accessible_name: actionTargets.submit.accessible_name,
                  },
                }),
          },
          credential_field_metadata: credentialFieldMetadata,
          credential_frame_origin: credentialFrameOrigin,
          form_submission_origin: actionTargets.submissionOrigin,
          top_level_origin: proposedUserPrompt.origin,
          visible_page_content: { format: "dom_cua_visible_dom", snapshot },
        },
      },
    });
    const [reviewResult, screenshotResult] = await Promise.allSettled([
      review,
      captureScreenshotAndValidateLocators(),
    ]);
    if (reviewResult.status === "rejected") throw reviewResult.reason;
    if (screenshotResult.status === "rejected") throw screenshotResult.reason;
    return screenshotResult.value != null
      ? screenshotResult.value
      : await revalidateAuthSafety(checkpoint, ctx);
  }
  return { captureAuthSafetySnapshot, reviewAuthSafety };
}
