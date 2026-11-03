import type { CdpDispatchOptions } from "./execute_methods";
export interface EvaluationOptions {
  returnByValue?: boolean;
  awaitPromise?: boolean;
  telemetryAttrs?: Record<string, unknown>;
  timeoutMs?: number;
}
export interface DocumentOwner {
  topLevelUrlsByTabId: Map<number, string>;
  api: {
    getCommittedTabUrl(tabId: number): Promise<string | null | undefined>;
  };
  call(
    tabId: unknown,
    method: string,
    params: unknown,
    options?: CdpDispatchOptions,
  ): Promise<any>;
  evaluateJavascript(
    tabId: unknown,
    expression: string,
    options?: EvaluationOptions,
  ): Promise<any>;
}
/** Original Ste. */
export function evaluationErrorMessage(details: any) {
  const value = details.exception?.value;
  return `Browser Use encountered an error interacting with this webpage: ${(typeof value === "string" ? value : details.exception?.description) ?? details.text ?? "JavaScript evaluation failed"}`;
}
export const documentMethods = {
  async readCommittedTabUrl(this: DocumentOwner, input: unknown) {
    const tabId = Number(input),
      url = await this.api.getCommittedTabUrl(tabId);
    if (url != null) this.topLevelUrlsByTabId.set(tabId, url);
    return url;
  },
  currentTopLevelUrl(this: DocumentOwner, input: unknown) {
    const tabId = Number(input);
    if (Number.isFinite(tabId)) return this.topLevelUrlsByTabId.get(tabId);
  },
  async evaluateJavascript(
    this: DocumentOwner,
    input: unknown,
    expression: string,
    options: EvaluationOptions = {},
  ) {
    const params: {
      expression: string;
      returnByValue: boolean;
      awaitPromise?: boolean;
    } = { expression, returnByValue: options.returnByValue ?? true };
    if (options.awaitPromise != null)
      params.awaitPromise = options.awaitPromise;
    const result = await this.call(input, "Runtime.evaluate", params, {
      telemetryAttrs: options.telemetryAttrs,
      timeoutMs: options.timeoutMs,
    });
    if (result.exceptionDetails != null)
      throw new Error(evaluationErrorMessage(result.exceptionDetails));
    return result.result?.value;
  },
  async readDocumentState(
    this: DocumentOwner,
    input: unknown,
    options: { includePaint?: boolean } = {},
  ) {
    try {
      const state = await this.evaluateJavascript(
        input,
        options.includePaint === true
          ? "({ href: window.location.href, readyState: document.readyState, painted: performance.getEntriesByType('paint').some(entry => entry.name === 'first-paint' || entry.name === 'first-contentful-paint') })"
          : "({ href: window.location.href, readyState: document.readyState })",
        { telemetryAttrs: { "browser_use.cdp.eval.kind": "document_state" } },
      );
      const tabId = Number(input);
      if (
        Number.isFinite(tabId) &&
        typeof state?.href === "string" &&
        state.href.length > 0
      )
        this.topLevelUrlsByTabId.set(tabId, state.href);
      return state;
    } catch {
      return;
    }
  },
};
