import {
  allowedRawDomains,
  blockedRawDomains,
  blockedRawMethods,
  rawMethodGuidance,
} from "./raw_policy_data";
import {
  rawRequestUrls,
  rawResponseUrls,
  rawCookieUrls,
  rawCookieReadUrls,
  rawCookiesUrls,
  requiredRawUrl,
  rawParametersBlocked,
  rawParamsObject,
} from "./raw_urls";
type Params = Record<string, unknown> | undefined;
/** Original rF. */
const methodRules = new Map<
  string,
  "block" | ((method: string, params: Params) => string[])
>([
  ["Fetch.continueRequest", rawRequestUrls],
  ["Fetch.continueResponse", rawResponseUrls],
  ["Fetch.fulfillRequest", rawResponseUrls],
  ["Input.dispatchDragEvent", "block"],
  ["Network.continueInterceptedRequest", "block"],
  ["Network.deleteCookies", rawCookieUrls],
  ["Network.getCertificate", "block"],
  ["Network.getCookies", rawCookieReadUrls],
  ["Network.loadNetworkResource", "block"],
  ["Network.replayXHR", "block"],
  ["Network.setCookie", rawCookieUrls],
  ["Network.setCookies", rawCookiesUrls],
  [
    "Page.deleteCookie",
    (method, params) => requiredRawUrl(method, params, "url"),
  ],
  ["Page.navigate", "block"],
  ["Page.navigateToHistoryEntry", "block"],
]);
/** Original Mc, shared identity retained when appended to Fetch patterns. */
export const documentResponsePattern = {
  requestStage: "Response",
  resourceType: "Document",
};
/** Original Yh. */
export function rawMethodRejection(method: string) {
  const guidance = rawMethodGuidance.get(method);
  return guidance == null
    ? "This method is not supported through raw CDP."
    : `This method is not supported through raw CDP. ${guidance}`;
}
/** Original tne/une. */
export function assertRawMethodAllowed(method: string, params: Params) {
  const dot = method.indexOf("."),
    domain = dot > 0 ? method.slice(0, dot) : null;
  if (
    domain == null ||
    !allowedRawDomains.has(domain) ||
    blockedRawDomains.has(domain) ||
    blockedRawMethods.has(method) ||
    methodRules.get(method) === "block" ||
    rawParametersBlocked(method, params)
  )
    throw new Error(rawMethodRejection(method));
}
/** Original nF: nested-target calls retain their raw patterns, root calls preserve managed Document interception. */
export function prepareRawCdpParams(
  method: string,
  params: Params,
  { preserveDocumentInterception }: { preserveDocumentInterception: boolean },
) {
  assertRawMethodAllowed(method, params);
  if (!preserveDocumentInterception) return params;
  if (method === "Fetch.disable") throw new Error(rawMethodRejection(method));
  if (method !== "Fetch.enable") return params;
  const patterns = params?.patterns;
  if (
    !Array.isArray(patterns) ||
    patterns.some(
      (pattern) =>
        !rawParamsObject(pattern) ||
        typeof pattern.resourceType !== "string" ||
        pattern.resourceType === "Document",
    )
  )
    throw new Error(rawMethodRejection(method));
  return { ...params, patterns: [...patterns, documentResponsePattern] };
}
/** Original oF. Validation of method/domain is deliberately separate. */
export function rawCdpAuthorityUrls(method: string, params: Params) {
  const rule = methodRules.get(method);
  if (rule === "block") throw new Error(rawMethodRejection(method));
  return rule?.(method, params) ?? [];
}
