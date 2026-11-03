/** Original vf. Read form action through prototype accessors, respecting an enabled submitter override. */
export async function readAuthSubmissionOrigin(
  request: {
    tab_id: string;
    submit?: { selector: string } | null;
    timeout_ms?: number;
  },
  context: {
    playwright: { evaluateOnPlaywrightSelector(...args: any[]): Promise<any> };
  },
  requirePost = false,
) {
  const selector = request.submit?.selector;
  if (selector == null) return null;
  try {
    return await context.playwright.evaluateOnPlaywrightSelector(
      request.tab_id,
      selector,
      (element: any, _injected: any, arg: any) => {
        const form = element.form;
        if (form == null) return null;
        const access = {
          get(key: string): any {
            return Reflect.get(HTMLFormElement.prototype, key, form);
          },
          submitter(candidate: any) {
            return (
              (candidate instanceof HTMLButtonElement ||
                candidate instanceof HTMLInputElement) &&
              !candidate.disabled &&
              (candidate.type === "submit" || candidate.type === "image")
            );
          },
        };
        const submitter: any = access.submitter(element)
          ? element
          : Array.from(access.get("elements")).find(access.submitter);
        const method =
          submitter?.hasAttribute("formmethod") === true
            ? submitter.formMethod
            : access.get("method");
        if (arg.requirePost && method !== "post") return;
        const action =
          submitter?.hasAttribute("formaction") === true
            ? submitter.formAction
            : access.get("action");
        try {
          const url = new URL(action);
          if (url.protocol === "javascript:") return null;
          url.hash = "";
          return url.protocol === "https:"
            ? { origin: url.origin, url: url.href }
            : undefined;
        } catch {
          return;
        }
      },
      {
        arg: { operation: "browser-auth-submission-origin", requirePost },
        isolatedWorld: true,
        timeoutMs: request.timeout_ms,
      },
    );
  } catch {
    return;
  }
}
