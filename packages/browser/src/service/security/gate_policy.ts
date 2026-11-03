import { AuthorityGateError } from "../errors/authority_gate_error";
import { httpOrigin } from "./authority_builder";

const noChecks = new Set<string>();
const localConsent = new Set([
  "browser-history-read",
  "browser-origin-access",
  "file-download",
  "file-upload",
  "full-cdp",
  "page-asset-cross-origin-fetch",
  "page-asset-download",
  "raw-cdp-destination-url",
  "webmcp-tool-call",
]);
const localChecks = new Set([
  "browser-history-read",
  "browser-origin-access",
  "check-navigation-url-policy",
  "check-url-site-status",
  "file-download",
  "file-upload",
  "full-cdp",
  "page-asset-cross-origin-fetch",
  "page-asset-download",
  "raw-cdp-destination-url",
]);
const hostedConsent = new Set([
  "browser-history-read",
  "file-download",
  "page-asset-cross-origin-fetch",
  "page-asset-download",
]);
const modes = {
  "": {
    bypassedSecurityChecks: noChecks,
    operationsWithoutUserConsent: noChecks,
  },
  "disabled-for-local-testing": {
    bypassedSecurityChecks: localChecks,
    operationsWithoutUserConsent: localConsent,
  },
  "gaas-browser-environment": {
    bypassedSecurityChecks: noChecks,
    operationsWithoutUserConsent: hostedConsent,
  },
};
type Runtime = { env: Record<string, unknown> };
export function securityMode(runtime: Runtime): keyof typeof modes {
  const raw = runtime.env.BROWSER_USE_SECURITY_MODE;
  const value = typeof raw === "string" ? raw.trim() : undefined;
  return (
    (Object.keys(modes).find((mode) => mode === value) as keyof typeof modes) ??
    ""
  );
}
export function operationWithoutConsent(runtime: Runtime, operation: string) {
  return modes[securityMode(runtime)].operationsWithoutUserConsent.has(
    operation,
  );
}
export function bypassesSecurityCheck(runtime: Runtime, check: string) {
  return modes[securityMode(runtime)].bypassedSecurityChecks.has(check);
}
/** Original KX gate-specific bypass routing. Host/configuration gates are never bypassed. */
export function shouldBypassGate(runtime: Runtime, gate: string) {
  switch (gate) {
    case "hostUrl":
    case "fullCdpConfiguration":
    case "webMcpConfiguration":
      return false;
    case "uploadPolicy":
      return bypassesSecurityCheck(runtime, "file-upload");
    case "uploadApproval":
      return operationWithoutConsent(runtime, "file-upload");
    case "downloadPolicy":
      return bypassesSecurityCheck(runtime, "file-download");
    case "downloadApproval":
      return operationWithoutConsent(runtime, "file-download");
    case "fullCdpPolicy":
      return bypassesSecurityCheck(runtime, "full-cdp");
    case "fullCdpApproval":
      return operationWithoutConsent(runtime, "full-cdp");
    case "historyPolicy":
      return securityMode(runtime) === "disabled-for-local-testing";
    case "historyApproval":
      return operationWithoutConsent(runtime, "browser-history-read");
    case "urlPolicy":
      return bypassesSecurityCheck(runtime, "check-navigation-url-policy");
    case "siteStatus":
      return bypassesSecurityCheck(runtime, "check-url-site-status");
    case "originPolicy":
      return bypassesSecurityCheck(runtime, "browser-origin-access");
    case "originApproval":
      return operationWithoutConsent(runtime, "browser-origin-access");
    case "webMcpApproval":
      return operationWithoutConsent(runtime, "webmcp-tool-call");
  }
}
export function urlSchemeCategory(value: string) {
  try {
    switch (new URL(value).protocol) {
      case "chrome-error:":
      case "edge-error:":
        return "browser_error";
      case "about:":
        return "about";
      case "blob:":
        return "blob";
      case "data:":
        return "data";
      case "file:":
        return "file";
      case "javascript:":
        return "javascript";
      default:
        return "other";
    }
  } catch {
    return "invalid";
  }
}
const allowedProtocols = Object.freeze(["http:", "https:"]);
const allowedUrls = new Set(["about:blank"]);
export function navigationUrlPolicy(value: string) {
  if (allowedUrls.has(value)) return { allowed: true, reason: "allowed" };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, reason: "invalid_url" };
  }
  return allowedProtocols.includes(url.protocol)
    ? { allowed: true, reason: "allowed" }
    : { allowed: false, reason: "unsupported_protocol" };
}
function urlPolicyMessage(reason: string) {
  switch (reason) {
    case "invalid_url":
      return "The requested URL is invalid.";
    case "unsupported_protocol":
      return `The requested URL protocol is not allowed. Allowed protocols: ${allowedProtocols.map((protocol) => `"${protocol}"`).join(", ")}.`;
  }
}
export function assertNavigationUrlAllowed(value: string) {
  const policy = navigationUrlPolicy(value);
  if (!policy.allowed)
    throw new AuthorityGateError(
      "urlPolicy",
      "navigation_url_policy_blocked",
      urlPolicyMessage(policy.reason)!,
      {
        origin: httpOrigin(value) ?? undefined,
        source: "navigation-url-policy",
        urlPolicyReason: policy.reason,
        urlSchemeCategory: urlSchemeCategory(value),
      },
    );
}
