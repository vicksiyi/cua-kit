export interface CdpTarget {
  tabId: number;
  sessionId?: string;
  targetId?: string;
}
/** Original At. */
export function isNestedTarget(target: CdpTarget) {
  return target.sessionId != null || target.targetId != null;
}
/** Original WN. */
export function cdpDomain(method: string) {
  return method.split(".", 1)[0] ?? method;
}
/** Original Tte. Raw API hides caller supplied method/domain labels behind full. */
export function rawCdpTelemetry(attributes?: Record<string, unknown>) {
  return {
    ...attributes,
    "browser_use.cdp.domain": "full",
    "browser_use.cdp.method": "full",
  };
}
/** Original zN. Inherited expression properties remain accepted. */
export function hasCdpExpression(
  params: unknown,
): params is {
  expression: string;
  awaitPromise?: unknown;
  returnByValue?: unknown;
} {
  return (
    typeof params === "object" &&
    params != null &&
    "expression" in params &&
    typeof params.expression === "string"
  );
}
/** Original Cte. */
export function evaluationTelemetry(method: string, params: unknown) {
  return method !== "Runtime.evaluate" || !hasCdpExpression(params)
    ? {}
    : {
        "browser_use.cdp.eval.await_promise": params.awaitPromise,
        "browser_use.cdp.eval.return_by_value": params.returnByValue,
      };
}
