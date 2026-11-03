import type { CdpTarget } from "../cdp/dispatch_helpers";
export interface ClipboardPageContext {
  cdp: {
    callTarget(target: CdpTarget, method: string, params: object): Promise<any>;
  };
  clipboard: {
    ensurePageClipboard(
      cdp: ClipboardPageContext["cdp"],
      target: CdpTarget,
    ): Promise<unknown>;
  };
}
/** Original yl/U5: install page bridge before executing a serialized page function. */
export async function executeClipboardPage({
  args,
  commandType,
  ctx,
  pageFunction,
  tabId,
  target,
  executionContextId,
}: {
  args: unknown;
  commandType: string;
  ctx: ClipboardPageContext;
  pageFunction: Function;
  tabId: number;
  target?: CdpTarget;
  executionContextId?: number;
}): Promise<any> {
  const destination = target ?? { tabId };
  await ctx.clipboard.ensurePageClipboard(ctx.cdp, destination);
  const response = await ctx.cdp.callTarget(destination, "Runtime.evaluate", {
    expression: `(
          async () => {
            try {
              const __name = (target) => target;
              const pageFunction = ${pageFunction.toString()};
              const data = await pageFunction(${JSON.stringify(args)});
              return { ok: true, data };
            } catch (error) {
              return {
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : String(error),
              };
            }
          }
        )()`,
    awaitPromise: true,
    ...(executionContextId == null ? {} : { contextId: executionContextId }),
    returnByValue: true,
  });
  if (response.exceptionDetails != null) {
    const details = String(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.exception?.value ??
        response.exceptionDetails.text ??
        `${commandType} failed`,
    );
    throw new Error(
      `Browser Use encountered an error interacting with this webpage's clipboard: ${details}`,
    );
  }
  const result = response.result?.value;
  if (result == null || typeof result !== "object" || !("ok" in result))
    throw new Error(
      `Browser Use encountered an error interacting with this webpage's clipboard: ${commandType} returned an invalid result`,
    );
  if (result.ok !== true) {
    const details =
      "error" in result && typeof result.error === "string"
        ? result.error
        : `${commandType} failed`;
    throw new Error(
      `Browser Use encountered an error interacting with this webpage's clipboard: ${details}`,
    );
  }
  return "data" in result ? result.data : undefined;
}
/** Original no/Ms. Used by clipboard HTML filtering and other credential-aware page logic. */
export const credentialFieldPolicy = {
  attributes: [
    "type",
    "autocomplete",
    "id",
    "name",
    "placeholder",
    "aria-label",
    "title",
  ],
  pattern:
    /user[-_ ]?name|e[-_ ]?mail|one[-_ ]?time[-_ ]?code|password|passcode|passwd|\botp\b|\b(?:2fa|mfa)\b|phone|mobile|\btel\b/i
      .source,
};
export function isCredentialField(
  element: Element,
  policy: typeof credentialFieldPolicy,
): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
  if (element.getAttribute("type")?.toLowerCase() === "hidden") return true;
  let attributes = "";
  for (const name of policy.attributes)
    attributes += ` ${element.getAttribute(name) ?? ""}`;
  return new RegExp(policy.pattern, "i").test(attributes);
}
