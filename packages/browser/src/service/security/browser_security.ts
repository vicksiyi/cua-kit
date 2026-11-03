import type { Preferences } from "../preferences/preferences";
import { AuthorityGateError } from "../errors/authority_gate_error";
import { AuthorityBuilder, httpOrigin } from "./authority_builder";
import { assertNavigationUrlAllowed, shouldBypassGate } from "./gate_policy";
import { checkSiteStatus } from "./site_status";
import {
  originApproval,
  assertOriginPolicy,
  noCommandTiming,
} from "./origin_approval";
import { approvalRuntime, browserDisplayName } from "./approval";
import { capabilityApprovals } from "./capability_approvals";
import { downloadSourceOrigin } from "../context/downloads";
type Display = NonNullable<Parameters<typeof browserDisplayName>[0]>;
type Runtime = Parameters<typeof checkSiteStatus>[0] & {
  createElicitation?: (request: any) => any;
  assertBrowserUrlAllowed?: (url: string) => unknown;
  otel?: { log(name: string, fields: Record<string, any>): unknown };
};
type Timing = Pick<typeof noCommandTiming, "trackElicitation">;
type Localize = Parameters<typeof capabilityApprovals.fileTransfer>[4];
interface Tabs {
  get(id: number): Promise<{ url?: string }>;
}
interface UserTabs {
  openTabs(): Promise<Array<{ id: number; url?: string }>>;
}
/** Original yf: assembles all restored security/approval providers. */
export class BrowserSecurity {
  tabs: Tabs;
  browserBackend: string;
  preferences: Preferences;
  runtime: Runtime;
  commandTiming: Timing;
  localize: Localize;
  userTabs: UserTabs | undefined;
  displayOptions: Display;
  constructor(
    tabs: Tabs,
    backend: string,
    preferences: Preferences,
    runtime: Runtime,
    timing: Timing,
    localize: Localize,
    display: Display = {},
    userTabs?: UserTabs,
  ) {
    this.tabs = tabs;
    this.browserBackend = backend;
    this.preferences = preferences;
    this.runtime = runtime;
    this.commandTiming = timing;
    this.localize = localize;
    this.userTabs = userTabs;
    this.displayOptions = { browserBackend: backend, ...display };
  }
  getCreateElicitation = () =>
    getSecurityElicitation(this.runtime, this.commandTiming);
  async currentTabUrl(tabId: number) {
    return (await this.tabs.get(tabId)).url;
  }
  gateProviders = {
    hostUrl: async (url: string) => {
      try {
        await this.runtime.assertBrowserUrlAllowed?.(url);
      } catch (cause) {
        throw new AuthorityGateError(
          "hostUrl",
          "browser_navigation_blocked",
          "The browser host blocked this URL.",
          { origin: httpOrigin(url) ?? undefined },
          { cause },
        );
      }
    },
    urlPolicy: assertNavigationUrlAllowed,
    siteStatus: async (url: string) => {
      if (
        (await checkSiteStatus(this.runtime, url, this.browserBackend))?.result
          .blocked
      )
        throw new AuthorityGateError(
          "siteStatus",
          "site_status_blocked",
          "Site safety policy blocked this URL.",
          { origin: httpOrigin(url) ?? undefined, source: "site-status" },
        );
    },
    originPolicy: (origin: string) =>
      assertOriginPolicy(origin, this.preferences),
    originApproval: (origin: string, bypass: boolean) =>
      originApproval.prepare(
        this.getCreateElicitation,
        origin,
        this.preferences,
        this.displayOptions,
        this.commandTiming,
        bypass,
      ),
    historyPolicy: async () => {
      if (await this.preferences.isHistoryBlockedByPolicy())
        throw new AuthorityGateError(
          "historyPolicy",
          "browser_capability_blocked",
          "Managed policy blocks browser history access.",
          { source: "codex-history-policy" },
        );
    },
    historyApproval: (request: any, bypass: boolean) =>
      capabilityApprovals.history(
        this.getCreateElicitation,
        historyApprovalParams(request),
        this.browserBackend,
        this.preferences,
        this.displayOptions,
        bypass,
      ),
    uploadPolicy: (url: string) => this.ensureOriginUploadPolicyAllowed(url),
    uploadApproval: (url: string) =>
      capabilityApprovals.fileTransfer(
        this.getCreateElicitation,
        "upload",
        url,
        this.preferences,
        this.localize,
        this.displayOptions,
      ),
    downloadPolicy: (url: string) => this.checkOriginDownloadPolicy(url),
    downloadApproval: (request: any) => {
      switch (request.type) {
        case "file":
          return capabilityApprovals.fileTransfer(
            this.getCreateElicitation,
            "download",
            request.url,
            this.preferences,
            this.localize,
            this.displayOptions,
          );
        case "page-assets":
          return capabilityApprovals.pageAssets(
            this.getCreateElicitation,
            request.pageUrl,
            this.preferences,
            this.localize,
            this.displayOptions,
          );
        case "page-asset-fetch":
          return capabilityApprovals.pageAssetFetch(
            this.getCreateElicitation,
            request.pageUrl,
            request.assetUrl,
            this.preferences,
            this.localize,
            this.displayOptions,
          );
      }
    },
    fullCdpConfiguration: () => this.preferences.assertFullCdpEnabled(),
    fullCdpPolicy: (url: string) => this.ensureOriginFullCdpPolicyAllowed(url),
    fullCdpApproval: (url: string) =>
      capabilityApprovals.fullCdp(
        this.getCreateElicitation,
        url,
        this.preferences,
        this.displayOptions,
      ),
    webMcpConfiguration: (url: string) => this.assertWebMcpOriginEnabled(url),
    webMcpApproval: (url: string, tool: any, tabId: number) =>
      this.prepareWebMcpApproval(tabId, url, tool),
  };
  createAuthorityBuilder({ embeddedWebsite = false } = {}) {
    return new AuthorityBuilder({
      providers: this.gateProviders,
      otel: this.runtime.otel,
      displayOptions: this.displayOptions,
      shouldBypassGate: (gate) => shouldBypassGate(this.runtime, gate),
      isMcpApp: this.browserBackend === "mcpapps" && !embeddedWebsite,
    });
  }
  async prepareWebMcpApproval(tabId: number, url: string, tool: any) {
    const { audit, requestApproval } = await capabilityApprovals.webMcp(
      this.getCreateElicitation,
      url,
      tool,
      this.displayOptions,
    );
    return async () => {
      const result = await requestApproval();
      if ((await this.currentTabUrl(tabId)) !== url)
        throw new AuthorityGateError(
          "webMcpApproval",
          "browser_context_unavailable",
          "The current page changed while waiting for approval.",
          audit,
        );
      return result;
    };
  }
  async currentTabFullCdpUrl(tabId: number) {
    const url = (await this.tabs.get(tabId)).url;
    if (typeof url !== "string" || url.trim().length === 0)
      approvalRuntime.failCheck(
        {
          check: "full-cdp",
          options: this.displayOptions,
          reason: "browser_context_unavailable",
        },
        `${this.browserName()} could not determine the current page URL before attempting to use raw CDP.`,
      );
    return url;
  }
  async assertWebMcpEnabled(tabId: number) {
    const { url } = await this.tabs.get(tabId);
    if (url == null)
      throw new Error(
        "The browser could not determine this tab’s website, so Site tools permissions could not be checked.",
      );
    await this.assertWebMcpOriginEnabled(url);
    return url;
  }
  async assertWebMcpOriginEnabled(url: string) {
    const origin = downloadSourceOrigin(url);
    if (origin == null)
      throw new Error(
        "The browser could not determine this tab’s website, so Site tools permissions could not be checked.",
      );
    const family = this.displayOptions.browserFamily;
    const settings =
      this.browserBackend === "iab"
        ? "codex://settings/browser-use"
        : this.browserBackend === "extension" &&
            (family === "chrome" || family === "edge")
          ? `codex://settings/computer-use/${family}`
          : undefined;
    const { enabled, message } = await this.preferences.isWebMcpEnabled(
      origin,
      settings,
    );
    if (!enabled)
      throw new AuthorityGateError(
        "webMcpConfiguration",
        "browser_capability_blocked",
        message!,
        { origin, source: "config" },
      );
  }
  async ensureOriginFullCdpPolicyAllowed(url: string) {
    if (await this.preferences.isOriginBlockedByPolicy(url, "fullCdpAccess"))
      throw new AuthorityGateError(
        "fullCdpPolicy",
        "enterprise_policy_blocked",
        "Managed policy blocks access to this origin.",
        {
          origin: httpOrigin(url) ?? undefined,
          source: "codex-network-policy",
        },
      );
  }
  async checkOriginDownloadPolicy(url: string) {
    if (await this.preferences.isOriginBlockedByPolicy(url, "downloads"))
      throw new AuthorityGateError(
        "downloadPolicy",
        "enterprise_policy_blocked",
        "Managed policy blocks access to this origin.",
        {
          origin: httpOrigin(url) ?? undefined,
          source: "codex-network-policy",
        },
      );
  }
  async currentUserTabUrl(tabId: number) {
    const url = (await this.userTabs?.openTabs())?.find(
      (tab) => tab.id === tabId,
    )?.url;
    if (typeof url !== "string" || url.trim().length === 0)
      approvalRuntime.failCheck(
        {
          check: "browser-origin-access",
          options: this.displayOptions,
          reason: "browser_context_unavailable",
        },
        `${this.browserName()} could not determine the selected user tab URL before reading its content.`,
      );
    return url;
  }
  async currentTabFileTransferUrl(tabId: number, direction: string) {
    const url = (await this.tabs.get(tabId)).url;
    if (typeof url !== "string" || url.trim().length === 0) {
      let check;
      switch (direction) {
        case "download":
          check = "file-download";
          break;
        case "upload":
          check = "file-upload";
          break;
      }
      approvalRuntime.failCheck(
        {
          check: check!,
          options: this.displayOptions,
          reason: "browser_context_unavailable",
        },
        `${this.browserName()} could not determine the current page URL before attempting to ${direction} files.`,
      );
    }
    return url;
  }
  async ensureOriginUploadPolicyAllowed(url: string) {
    if (await this.preferences.isOriginBlockedByPolicy(url, "uploads"))
      throw new AuthorityGateError(
        "uploadPolicy",
        "enterprise_policy_blocked",
        "Managed policy blocks access to this origin.",
        {
          origin: httpOrigin(url) ?? undefined,
          source: "codex-network-policy",
        },
      );
  }
  browserName() {
    return browserDisplayName(this.displayOptions);
  }
}
export function getSecurityElicitation(runtime: Runtime, timing: Timing) {
  if (typeof runtime.createElicitation !== "function")
    throw new Error("Browser security elicitation is unavailable");
  return timing.trackElicitation(runtime.createElicitation);
}
/** Original HX/WX/$X/GX/JB/VX/rD: history prompt projection. */
export function historyApprovalParams(value: any) {
  if (typeof value !== "object" || value == null) return { max_results: 100 };
  const result: Record<string, any> = {};
  const queries = value.queries;
  if (Array.isArray(queries)) {
    const copy = [];
    let valid = true;
    for (const query of queries) {
      if (typeof query !== "string") {
        valid = false;
        break;
      }
      copy.push(query);
    }
    if (valid) result.queries = copy;
  }
  result.date_range = historyDateRange(value.from, value.to);
  const limit = value.limit;
  result.max_results = typeof limit === "number" ? limit : 100;
  return result;
}
function historyDate(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(parsed));
}
function historyDateRange(from: unknown, to: unknown) {
  const start = historyDate(from),
    end = historyDate(to);
  return start != null && end != null
    ? `${start} to ${end}`
    : start != null
      ? `Since ${start}`
      : end != null
        ? `Before ${end}`
        : "All history";
}
