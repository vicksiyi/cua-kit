import { codexTurnMetadata } from "../preferences/request_context";
import {
  BrowserUseSecurityError,
  SECURITY_REJECTED_PREFIX,
  SECURITY_REJECTED_SUFFIX,
} from "../errors/browser_security_error";
import { bypassesSecurityCheck } from "./gate_policy";
import { approvalRuntime, browserDisplayName } from "./approval";
import { httpOrigin } from "./authority_builder";
const defaultBackend = "https://chatgpt.com/backend-api";
const requestSource = "codex_browser_use";
interface Runtime {
  env: Record<string, any>;
  requestMeta?: Record<string, any>;
  fetch?: (
    url: string,
    options: { method: string },
  ) => Promise<{ ok: boolean; json(): Promise<any> }>;
}
export interface SiteStatusRequest {
  cacheKey: string;
  displayUrl: string;
  endpoint: string;
}
/** Original Rs: direct optional trim deliberately preserves malformed env behavior. */
export function siteStatusBackend(runtime: Runtime) {
  const configured = runtime.env.BROWSER_USE_BACKEND_API_URL?.trim();
  if (!configured)
    return runtime.env.BROWSER_USE_CHATGPT_ENVIRONMENT === "staging"
      ? "https://chatgpt-staging.com/backend-api"
      : defaultBackend;
  let url;
  try {
    url = new URL(configured);
  } catch {}
  if (
    url == null ||
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Browser Use backend API URL must be an HTTP(S) base URL.");
  return url.toString().replace(/\/+$/, "");
}
/** Original eC/W8/$8/G8: request retains query, display URL does not. */
export function siteStatusRequest(
  value: string,
  {
    conversationId,
    turnId,
    urlRequestSource = requestSource,
    backendApiBaseUrl = defaultBackend,
  }: {
    conversationId?: string;
    turnId?: string;
    urlRequestSource?: string;
    backendApiBaseUrl?: string;
  } = {},
): SiteStatusRequest | null {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Browser Use cannot visit the requested page because the URL is invalid. Use a complete http:// or https:// URL.",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.trim().toLowerCase();
  if (host.length === 0)
    throw new Error(
      "Browser Use cannot visit the requested page because the URL does not include a website host.",
    );
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  )
    return null;
  const display = new URL(url.origin);
  display.pathname = url.pathname;
  const shown = display.toString();
  const target = new URL(url.origin);
  target.pathname = url.pathname;
  target.search = url.search;
  const endpoint = new URL(`${backendApiBaseUrl}/aura/site_status`);
  endpoint.searchParams.set("site_url", target.toString());
  endpoint.searchParams.set("url_request_source", urlRequestSource);
  if (conversationId != null)
    endpoint.searchParams.set("conversation_id", conversationId);
  if (turnId != null) endpoint.searchParams.set("turn_id", turnId);
  return {
    cacheKey: host.startsWith("www.") ? host.slice(4) : host,
    displayUrl: display.pathname === "/" ? shown.slice(0, -1) : shown,
    endpoint: endpoint.toString(),
  };
}
export function siteStatusBlocked(value: any) {
  if (typeof value !== "object" || value == null) return false;
  const status = value.feature_status;
  return typeof status === "object" && status != null
    ? status.agent === true
    : false;
}
/** Original D_/qX. Every call starts a fetch, even when cache or an existing request supplies the answer. */
export class SiteStatus {
  now: () => number;
  getTurnMetadata: typeof codexTurnMetadata;
  cache = new Map<string, { blocked: boolean; timestampMs: number }>();
  inflightRequests = new Map<string, Promise<boolean>>();
  constructor(now = Date.now, getTurnMetadata = codexTurnMetadata) {
    this.now = now;
    this.getTurnMetadata = getTurnMetadata;
  }
  async throwIfBlocksUrl(
    runtime: Runtime,
    url: string,
    backend: string,
    display: Parameters<typeof browserDisplayName>[0],
    authorization = "browser-origin-access",
  ) {
    if (
      bypassesSecurityCheck(runtime, "check-url-site-status") ||
      typeof url !== "string"
    )
      return;
    const status = await this.checkUrl(runtime, url, backend);
    if (status == null) return;
    const { request, result } = status,
      name = browserDisplayName(display),
      family = display?.browserFamily;
    if (result.blocked) {
      approvalRuntime.emitAudit(() => ({
        authorization,
        backend,
        browserFamily: family,
        check: "check-url-site-status",
        origin: httpOrigin(url) ?? undefined,
        permissionSource: "site-status",
        outcome: "denied",
        reason: "site_status_blocked",
        ...(result.cached ? { cached: true } : {}),
      }));
      throw new BrowserUseSecurityError(
        "site_status_blocked",
        `${name} is not permitted on ${request.displayUrl}.`,
      );
    }
  }
  async checkUrl(runtime: Runtime, url: string, backend?: string) {
    const meta = this.getTurnMetadata(runtime),
      request = siteStatusRequest(url, {
        backendApiBaseUrl: siteStatusBackend(runtime),
        conversationId: meta?.session_id,
        turnId: meta?.turn_id,
        urlRequestSource:
          backend == null ? requestSource : `${requestSource}:${backend}`,
      });
    if (request == null) return;
    let result;
    try {
      result = await this.isBlocked(runtime, request);
    } catch {
      return;
    }
    return { request, result };
  }
  async isBlocked(runtime: Runtime, request: SiteStatusRequest) {
    const fetching = this.fetchBlocked(runtime, request),
      cached = this.cachedBlocked(request.cacheKey);
    if (cached != null) {
      fetching.catch(() => {});
      return { blocked: cached, cached: true };
    }
    const existing = this.inflightRequests.get(request.cacheKey);
    if (existing != null) {
      fetching.catch(() => {});
      return { blocked: await existing, cached: false };
    }
    const pending = fetching
      .then((blocked) => {
        this.cache.set(request.cacheKey, { blocked, timestampMs: this.now() });
        return blocked;
      })
      .finally(() => {
        if (this.inflightRequests.get(request.cacheKey) === pending)
          this.inflightRequests.delete(request.cacheKey);
      });
    this.inflightRequests.set(request.cacheKey, pending);
    return { blocked: await pending, cached: false };
  }
  cachedBlocked(key: string) {
    const entry = this.cache.get(key);
    if (entry == null || this.now() - entry.timestampMs >= 86400000) {
      if (entry != null) this.cache.delete(key);
      return null;
    }
    return entry.blocked;
  }
  async fetchBlocked(runtime: Runtime, request: SiteStatusRequest) {
    const response = await fetchSiteStatus(runtime, request.endpoint, {
      method: "GET",
    });
    if (!response.ok)
      throw new Error("Browser Use site-status request failed.");
    return siteStatusBlocked(await response.json());
  }
}
export const siteStatus = new SiteStatus();
export function checkSiteStatus(
  runtime: Runtime,
  url: string,
  backend?: string,
) {
  return siteStatus.checkUrl(runtime, url, backend);
}

/** Original mf retains its own async boundary. */
export async function fetchSiteStatus(
  runtime: Runtime,
  endpoint: string,
  options: { method: string },
) {
  if (typeof runtime.fetch !== "function")
    throw new Error(
      `${SECURITY_REJECTED_PREFIX} Browser Use cannot determine if this website is allowed. Please try again later or use another source.${SECURITY_REJECTED_SUFFIX}`,
    );
  return await runtime.fetch(endpoint, options);
}
