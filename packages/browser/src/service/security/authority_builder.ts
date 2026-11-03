import { downloadSourceOrigin } from "../context/downloads";
import { AuthorityGateError } from "../errors/authority_gate_error";
import {
  BrowserUseSecurityError,
  type BrowserSecurityReason,
} from "../errors/browser_security_error";

export function httpOrigin(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
/** Original wa; retains the specialized URL-policy error fields. */
export class NavigationUrlPolicyError extends BrowserUseSecurityError {
  urlPolicyReason: string;
  urlSchemeCategory: string;
  constructor(
    reason: string,
    category: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super("navigation_url_policy_blocked", message, options);
    this.urlPolicyReason = reason;
    this.urlSchemeCategory = category;
  }
}
const authorityDescriptions = {
  triggerNetworkEgress: "trigger network egress",
  actInFrame: "act in a frame",
  observeContent: "observe page content",
  readBrowsingHistory: "read browsing history",
  uploadFiles: "upload files",
  downloadFiles: "download files",
  useCdp: "use raw CDP",
  useWebMcp: "use WebMCP tools",
};
const gateDescriptions = {
  hostUrl: "browser host restrictions",
  urlPolicy: "URL policy",
  siteStatus: "site safety",
  originPolicy: "origin policy",
  originApproval: "origin approval",
  historyPolicy: "history policy",
  historyApproval: "history approval",
  uploadPolicy: "upload policy",
  uploadApproval: "upload approval",
  downloadPolicy: "download policy",
  downloadApproval: "download approval",
  fullCdpConfiguration: "CDP configuration",
  fullCdpPolicy: "CDP origin policy",
  fullCdpApproval: "CDP approval",
  webMcpConfiguration: "WebMCP configuration",
  webMcpApproval: "WebMCP approval",
};
type Gate = keyof typeof gateDescriptions;
interface AuthorityOptions {
  providers: Record<Gate, (...args: any[]) => any>;
  shouldBypassGate(gate: Gate): boolean | undefined;
  isMcpApp?: boolean;
  displayOptions?: {
    elicitationDisplayName?: string;
    browserBackend?: string;
    browserFamily?: string;
  };
  otel?: { log(name: string, fields: Record<string, any>): unknown };
}
type Download =
  | { type: "file"; url: string }
  | { type: "page-assets"; pageUrl: string }
  | { type: "page-asset-fetch"; pageUrl: string; assetUrl: string };
/** Original bf: accumulate gates, prepare concurrently, then invoke approvals serially. */
export class AuthorityBuilder {
  options: AuthorityOptions;
  authorities = new Set<keyof typeof authorityDescriptions>();
  hostUrls = new Set<string>();
  urlPolicyUrls = new Set<string>();
  siteStatusUrls = new Set<string>();
  originPolicyOrigins = new Set<string>();
  originApprovalOrigins = new Map<string, { bypassApproval: boolean }>();
  historyPolicy = false;
  historyApprovals: any[] = [];
  uploadPolicyUrls = new Set<string>();
  uploadApprovalUrls = new Set<string>();
  downloadPolicyUrls = new Set<string>();
  downloadApprovalUrls = new Set<string>();
  pageAssetDownloadApprovalUrls = new Set<string>();
  pageAssetFetchApprovals: Array<{ pageUrl: string; assetUrl: string }> = [];
  fullCdpConfiguration = false;
  fullCdpPolicyUrls = new Set<string>();
  fullCdpApprovalUrls = new Set<string>();
  webMcpConfigurationUrls = new Set<string>();
  webMcpApprovals: Array<{
    url: string | undefined;
    tool: any;
    tabId: number;
  }> = [];
  constructor(options: AuthorityOptions) {
    this.options = options;
  }
  triggerNetworkEgress(url: string) {
    this.authorities.add("triggerNetworkEgress");
    this.hostUrls.add(url);
    this.urlPolicyUrls.add(url);
    const origin = downloadSourceOrigin(url);
    if (origin != null) {
      this.originPolicyOrigins.add(origin);
      this.originApprovalOrigins.set(origin, { bypassApproval: false });
    }
    return this;
  }
  actInFrame(url?: string) {
    this.authorities.add("actInFrame");
    if (this.options.isMcpApp) {
      if (url == null) throw new Error("MCP App target is unavailable.");
      const parsed = new URL(url),
        origin = `${parsed.protocol}//${parsed.host}`;
      this.originPolicyOrigins.add(origin);
      if (!this.originApprovalOrigins.has(origin))
        this.originApprovalOrigins.set(origin, { bypassApproval: true });
      return this;
    }
    if (url === undefined) return this;
    this.hostUrls.add(url);
    this.urlPolicyUrls.add(url);
    this.siteStatusUrls.add(url);
    const origin = downloadSourceOrigin(url);
    if (origin != null) {
      this.originPolicyOrigins.add(origin);
      this.originApprovalOrigins.set(origin, { bypassApproval: false });
    }
    return this;
  }
  observeContent(url: string | undefined, { bypassApproval = false } = {}) {
    this.authorities.add("observeContent");
    if (this.options.isMcpApp) {
      if (url == null) throw new Error("MCP App target is unavailable.");
      const parsed = new URL(url),
        origin = `${parsed.protocol}//${parsed.host}`;
      this.originPolicyOrigins.add(origin);
      if (!this.originApprovalOrigins.has(origin))
        this.originApprovalOrigins.set(origin, { bypassApproval: true });
      return this;
    }
    if (url === undefined) return this;
    this.hostUrls.add(url);
    this.urlPolicyUrls.add(url);
    this.siteStatusUrls.add(url);
    const origin = downloadSourceOrigin(url);
    if (origin != null) {
      this.originPolicyOrigins.add(origin);
      if (!bypassApproval || !this.originApprovalOrigins.has(origin))
        this.originApprovalOrigins.set(origin, { bypassApproval });
    }
    return this;
  }
  readBrowsingHistory(request: any) {
    this.authorities.add("readBrowsingHistory");
    this.historyPolicy = true;
    this.historyApprovals.push(request);
    return this;
  }
  uploadFiles(url: string) {
    this.authorities.add("uploadFiles");
    this.uploadPolicyUrls.add(url);
    this.uploadApprovalUrls.add(url);
    return this;
  }
  downloadFiles(request: Download) {
    this.authorities.add("downloadFiles");
    switch (request.type) {
      case "file": {
        const { url } = request;
        this.hostUrls.add(url);
        this.urlPolicyUrls.add(url);
        this.siteStatusUrls.add(url);
        this.downloadPolicyUrls.add(url);
        this.downloadApprovalUrls.add(url);
        break;
      }
      case "page-assets": {
        const origin = downloadSourceOrigin(request.pageUrl);
        if (origin != null) this.downloadPolicyUrls.add(origin);
        this.pageAssetDownloadApprovalUrls.add(request.pageUrl);
        break;
      }
      case "page-asset-fetch": {
        const origin = downloadSourceOrigin(request.assetUrl);
        if (origin != null && origin !== downloadSourceOrigin(request.pageUrl))
          this.downloadPolicyUrls.add(origin);
        this.pageAssetFetchApprovals.push({
          pageUrl: request.pageUrl,
          assetUrl: request.assetUrl,
        });
        break;
      }
    }
    return this;
  }
  useCdp(url: string) {
    this.authorities.add("useCdp");
    this.fullCdpConfiguration = true;
    this.hostUrls.add(url);
    this.urlPolicyUrls.add(url);
    this.siteStatusUrls.add(url);
    this.fullCdpPolicyUrls.add(url);
    this.fullCdpApprovalUrls.add(httpOrigin(url) ?? url);
    const origin = httpOrigin(url);
    if (origin != null) {
      this.originPolicyOrigins.add(origin);
      if (!this.originApprovalOrigins.has(origin))
        this.originApprovalOrigins.set(origin, { bypassApproval: true });
    }
    return this;
  }
  useWebMcp(url: string | undefined, tool: any, tabId: number) {
    this.authorities.add("useWebMcp");
    if (url != null) this.webMcpConfigurationUrls.add(url);
    if (this.options.isMcpApp) {
      if (url == null) throw new Error("MCP App target is unavailable.");
      const parsed = new URL(url),
        origin = `${parsed.protocol}//${parsed.host}`;
      this.originPolicyOrigins.add(origin);
      if (!this.originApprovalOrigins.has(origin))
        this.originApprovalOrigins.set(origin, { bypassApproval: true });
    } else if (url !== undefined) {
      this.hostUrls.add(url);
      this.urlPolicyUrls.add(url);
      this.siteStatusUrls.add(url);
      const origin = downloadSourceOrigin(url);
      if (origin != null) {
        this.originPolicyOrigins.add(origin);
        this.originApprovalOrigins.set(origin, { bypassApproval: false });
      }
    }
    this.webMcpApprovals.push({ url, tool, tabId });
    return this;
  }
  async assert() {
    const checks: any[] = [],
      preparations: any[] = [],
      approvals: any[] = [];
    try {
      const { providers, shouldBypassGate } = this.options;
      if (
        this.fullCdpConfiguration &&
        !shouldBypassGate("fullCdpConfiguration")
      )
        checks.push(providers.fullCdpConfiguration());
      if (!shouldBypassGate("webMcpConfiguration"))
        for (const url of this.webMcpConfigurationUrls)
          checks.push(providers.webMcpConfiguration(url));
      if (this.hostUrls.size > 0 && !shouldBypassGate("hostUrl"))
        for (const url of this.hostUrls) checks.push(providers.hostUrl(url));
      if (this.siteStatusUrls.size > 0 && !shouldBypassGate("siteStatus"))
        for (const url of this.siteStatusUrls)
          checks.push(providers.siteStatus(url));
      if (
        this.originPolicyOrigins.size > 0 &&
        !shouldBypassGate("originPolicy")
      )
        for (const origin of this.originPolicyOrigins)
          checks.push(providers.originPolicy(origin));
      if (
        this.originApprovalOrigins.size > 0 &&
        !shouldBypassGate("originApproval")
      )
        for (const [origin, { bypassApproval }] of this.originApprovalOrigins)
          preparations.push(providers.originApproval(origin, bypassApproval));
      if (this.historyPolicy) {
        const bypassPolicy = shouldBypassGate("historyPolicy"),
          bypassApproval = shouldBypassGate("historyApproval");
        if (!bypassPolicy) {
          checks.push(providers.historyPolicy());
          for (const request of this.historyApprovals)
            preparations.push(
              providers.historyApproval(request, bypassApproval),
            );
        }
      }
      if (this.uploadPolicyUrls.size > 0 && !shouldBypassGate("uploadPolicy"))
        for (const url of this.uploadPolicyUrls)
          checks.push(providers.uploadPolicy(url));
      if (
        this.uploadApprovalUrls.size > 0 &&
        !shouldBypassGate("uploadApproval")
      )
        for (const url of this.uploadApprovalUrls)
          preparations.push(providers.uploadApproval(url));
      if (
        this.downloadPolicyUrls.size > 0 &&
        !shouldBypassGate("downloadPolicy")
      )
        for (const url of this.downloadPolicyUrls)
          checks.push(providers.downloadPolicy(url));
      if (
        (this.downloadApprovalUrls.size > 0 ||
          this.pageAssetDownloadApprovalUrls.size > 0 ||
          this.pageAssetFetchApprovals.length > 0) &&
        !shouldBypassGate("downloadApproval")
      ) {
        for (const url of this.downloadApprovalUrls)
          preparations.push(providers.downloadApproval({ type: "file", url }));
        for (const pageUrl of this.pageAssetDownloadApprovalUrls)
          preparations.push(
            providers.downloadApproval({ type: "page-assets", pageUrl }),
          );
        for (const { pageUrl, assetUrl } of this.pageAssetFetchApprovals)
          preparations.push(
            providers.downloadApproval({
              type: "page-asset-fetch",
              pageUrl,
              assetUrl,
            }),
          );
      }
      if (this.fullCdpPolicyUrls.size > 0 && !shouldBypassGate("fullCdpPolicy"))
        for (const url of this.fullCdpPolicyUrls)
          checks.push(providers.fullCdpPolicy(url));
      if (
        this.fullCdpApprovalUrls.size > 0 &&
        !shouldBypassGate("fullCdpApproval")
      )
        for (const url of this.fullCdpApprovalUrls)
          preparations.push(providers.fullCdpApproval(url));
      if (
        this.webMcpApprovals.length > 0 &&
        !shouldBypassGate("webMcpApproval")
      )
        for (const { url, tool, tabId } of this.webMcpApprovals)
          preparations.push(providers.webMcpApproval(url, tool, tabId));
      if (this.urlPolicyUrls.size > 0 && !shouldBypassGate("urlPolicy"))
        for (const url of this.urlPolicyUrls) providers.urlPolicy(url);
      const [, prepared] = await Promise.all([
        Promise.all(checks),
        Promise.all(preparations),
      ]);
      for (const approve of prepared) {
        const result = await approve();
        if (result != null) approvals.push(result);
      }
      this.logDecision(approvals);
    } catch (error) {
      Promise.all([...checks, ...preparations]).catch(() => {});
      if (!(error instanceof AuthorityGateError)) throw error;
      this.logDecision(approvals, error);
      const descriptions = [...this.authorities]
        .map((authority) => authorityDescriptions[authority])
        .join(", ");
      const { origin, toolName } = error.context;
      const target = [origin, toolName]
        .filter((value) => value != null)
        .join(" / ");
      const message = `${this.options.displayOptions?.elicitationDisplayName ?? "Browser use"} could not acquire authority to ${descriptions}. The ${gateDescriptions[error.gate as Gate]} gate did not grant access${target ? ` for ${target}` : ""}. ${error.message}`;
      throw error.context.urlPolicyReason != null &&
        error.context.urlSchemeCategory != null
        ? new NavigationUrlPolicyError(
            error.context.urlPolicyReason as string,
            error.context.urlSchemeCategory as string,
            message,
            { cause: error },
          )
        : new BrowserUseSecurityError(
            error.reason as BrowserSecurityReason,
            message,
            { cause: error },
          );
    }
  }
  logDecision(approvals: any[], error?: AuthorityGateError) {
    try {
      this.options.otel?.log("codex.browser_use.authority_acquisition", {
        authorities: JSON.stringify([...this.authorities]),
        approvals: JSON.stringify(approvals),
        outcome: error == null ? "success" : "denied",
        gate: error?.gate,
        reason: error?.reason,
        source: error?.context.source,
        origin: httpOrigin(error?.context.origin) ?? undefined,
        tool_name: error?.context.toolName,
        backend: this.options.displayOptions?.browserBackend,
        browser_family: this.options.displayOptions?.browserFamily,
      });
    } catch {}
  }
}
