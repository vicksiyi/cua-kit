/** Original _l: new Error with contextual text, retaining the original stack when present. */
export function appendErrorContext(error: unknown, context: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${message}\n${context}`);
  if (error instanceof Error && error.stack)
    wrapped.stack = `${wrapped.name}: ${wrapped.message}\n${error.stack}`;
  return wrapped;
}
/** Original yl. String patterns take precedence over match-count diagnostics. */
export function classifyActionError(
  error: unknown,
  diagnostics: { matchCount?: number; visibleCount?: number },
) {
  const message = error instanceof Error ? error.message : String(error);
  return /strict mode violation/i.test(message)
    ? "multiple_matches"
    : /intercept|receives pointer events/i.test(message)
      ? "intercepted"
      : diagnostics.matchCount === 0
        ? "no_matches"
        : diagnostics.visibleCount === 0
          ? "no_visible_match"
          : "action_failed";
}
/** Original wl, run before pageFunction validation by both script builders. */
export function serializeEvaluationArgument(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) return serialized;
  } catch (error) {
    throw appendErrorContext(
      error,
      "playwright.evaluate arg must be JSON-serializable",
    );
  }
  throw new Error("playwright.evaluate arg must be JSON-serializable");
}
/** Original fl. */
export function pageEvaluationScript(
  pageFunction: string | Function,
  arg: unknown,
): string {
  const serialized = serializeEvaluationArgument(arg);
  if (typeof pageFunction === "string") {
    if (pageFunction.length === 0)
      throw new Error("playwright.evaluate requires a pageFunction");
    return `const arg = ${serialized};\nreturn (${pageFunction});`;
  }
  if (typeof pageFunction === "function")
    return [
      `const arg = ${serialized};`,
      `const __playwrightEvaluate = (${pageFunction.toString()});`,
      "return await __playwrightEvaluate(arg);",
    ].join("\n");
  throw new Error("playwright.evaluate requires a string or function");
}
/** Original gl. Unknown runtime mode follows the original single-element branch. */
export function locatorEvaluationScript(
  pageFunction: string | Function,
  arg: unknown,
  mode: "all" | "single",
): string {
  const serialized = serializeEvaluationArgument(arg),
    operation = mode === "all" ? "locator.evaluateAll" : "locator.evaluate";
  if (typeof pageFunction === "string") {
    if (pageFunction.length === 0)
      throw new Error(`${operation} requires a pageFunction`);
    return `const arg = ${serialized};\nreturn (${pageFunction});`;
  }
  if (typeof pageFunction === "function")
    return [
      `const arg = ${serialized};`,
      `const __playwrightEvaluate = (${pageFunction.toString()});`,
      `return await __playwrightEvaluate(${mode === "all" ? "elements" : "element"}, arg);`,
    ].join("\n");
  throw new Error(`${operation} requires a string or function`);
}
/** Original vl. */
export function requireCoordinates(
  operation: string,
  point: { x: number; y: number },
): { x: number; y: number } {
  const { x, y } = point;
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error(`${operation} requires numeric x and y coordinates`);
  return { x, y };
}
