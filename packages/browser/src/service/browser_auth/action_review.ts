import { authSelectors, type AuthBindingRequest } from "./bindings";
import { readAuthSubmissionOrigin } from "./submission_origin";

export interface AuthActionReviewContext {
  playwright: { evaluateOnPlaywrightSelector(...args: any[]): Promise<any> };
}
/** Original pc: preserve null (no native form) versus undefined (unreviewable). */
export async function authSubmissionOrigin(
  request: AuthBindingRequest,
  context: AuthActionReviewContext,
  requirePost = false,
) {
  const submission = await readAuthSubmissionOrigin(
    request,
    context,
    requirePost,
  );
  return submission == null ? submission : submission.origin;
}
/** Original xY: require each selected element and its outer frame within the snapshot root. */
export async function authTargetsInSnapshotRoot(
  request: AuthBindingRequest,
  context: AuthActionReviewContext,
) {
  const selectors = authSelectors(request).flatMap((selector) => {
    const outer =
      selector.split(" >> internal:control=enter-frame >> ")[0] ?? selector;
    return outer === selector ? [selector] : [outer, selector];
  });
  try {
    return (
      await Promise.all(
        selectors.map((selector) =>
          context.playwright.evaluateOnPlaywrightSelector(
            request.tab_id,
            selector,
            (element: any) => {
              const view = element.ownerDocument.defaultView;
              if (view == null) return false;
              const root =
                element.ownerDocument.body ??
                element.ownerDocument.documentElement;
              let current = element;
              while (!root.contains(current)) {
                const tree = current.getRootNode();
                if (!(tree instanceof view.ShadowRoot)) return false;
                current = tree.host;
              }
              return true;
            },
            {
              arg: { operation: "browser-auth-snapshot-root" },
              isolatedWorld: true,
              timeoutMs: request.timeout_ms,
            },
          ),
        ),
      )
    ).every(Boolean);
  } catch {
    return false;
  }
}
/** Original PD. Accessible naming comes from the injected Playwright utility. */
export async function readAuthActionTarget(
  selector: string,
  request: AuthBindingRequest,
  context: AuthActionReviewContext,
) {
  try {
    const metadata = await context.playwright.evaluateOnPlaywrightSelector(
      request.tab_id,
      selector,
      (element: any, injected: any) => {
        const name = injected.utils
          .getElementAccessibleName(element, false)
          .replace(/\s+/g, " ")
          .trim();
        return {
          accessible_name:
            name.length === 0
              ? null
              : name.length <= 80
                ? name
                : `${name.slice(0, 79)}…`,
          origin:
            element.ownerDocument.defaultView?.location.origin ??
            window.location.origin,
        };
      },
      {
        arg: { operation: "browser-auth-action-target-metadata" },
        isolatedWorld: true,
        timeoutMs: request.timeout_ms,
      },
    );
    return { selector, ...metadata };
  } catch {
    return null;
  }
}
/** Original dc: snapshot gate, submission origin, option targets, then submit target. */
export async function readAuthActionTargets(
  request: AuthBindingRequest & {
    submit?: { selector: string; action: string } | null;
  },
  context: AuthActionReviewContext,
) {
  if (!(await authTargetsInSnapshotRoot(request, context))) return null;
  const submissionOrigin = await authSubmissionOrigin(request, context);
  if (submissionOrigin === undefined) return null;
  const options = [];
  for (const option of request.options ?? []) {
    if (option.selector == null) continue;
    const target = await readAuthActionTarget(
      option.selector,
      request,
      context,
    );
    if (target == null) return null;
    options.push({ id: option.id, ...target });
  }
  if (request.submit == null) return { options, submissionOrigin };
  const submit = await readAuthActionTarget(
    request.submit.selector,
    request,
    context,
  );
  return submit == null
    ? null
    : {
        options,
        submissionOrigin,
        submit: { action: request.submit.action, ...submit },
      };
}
