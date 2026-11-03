import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  BrowserSecurity,
  historyApprovalParams,
} from "../packages/browser/src/service/security/browser_security";
import { AuthorityGateError } from "../packages/browser/src/service/errors/authority_gate_error";
import {
  AuthorityBuilder,
  httpOrigin,
} from "../packages/browser/src/service/security/authority_builder";
import {
  assertNavigationUrlAllowed,
  shouldBypassGate,
} from "../packages/browser/src/service/security/gate_policy";
import {
  siteStatus,
  checkSiteStatus,
} from "../packages/browser/src/service/security/site_status";
import {
  originApproval,
  assertOriginPolicy,
  noCommandTiming,
} from "../packages/browser/src/service/security/origin_approval";
import {
  approvalRuntime,
  browserDisplayName,
} from "../packages/browser/src/service/security/approval";
import { capabilityApprovals } from "../packages/browser/src/service/security/capability_approvals";
import { downloadSourceOrigin } from "../packages/browser/src/service/context/downloads";
// Compare exact original facade over the same restored providers (each has separate source-differential tests).
const original = originalServiceBindings(
  ["yf", "QB", "HX", "WX", "$X", "GX", "JB", "VX", "rD"],
  {
    Oe: AuthorityGateError,
    bf: AuthorityBuilder,
    ze: httpOrigin,
    zX: assertNavigationUrlAllowed,
    KX: shouldBypassGate,
    YB: checkSiteStatus,
    NB: assertOriginPolicy,
    FB: originApproval.prepare,
    LB: capabilityApprovals.history,
    I_: capabilityApprovals.fileTransfer,
    GB: capabilityApprovals.pageAssets,
    VB: capabilityApprovals.pageAssetFetch,
    WB: capabilityApprovals.fullCdp,
    KB: capabilityApprovals.webMcp,
    ho: approvalRuntime.failCheck,
    nt: browserDisplayName,
    qe: downloadSourceOrigin,
  },
);
function view(error: any): any {
  return error == null
    ? error
    : {
        name: error.name,
        message: error.message,
        reason: error.reason,
        gate: error.gate,
        context: error.context,
        cause: view(error.cause),
      };
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: view(error) };
  }
}
async function scenario(Constructor: any, backend: string, mode: string) {
  const trace: any[] = [],
    url = "https://site.test/path",
    state = { url },
    saved = { decision: "approve", source: "session", scope: "session" };
  const preferences: any = {
    captureOriginRequestContext: () => ({ guardianMode: "v1" }),
    getOriginPermission: async () => saved,
    isOriginBlockedByPolicy: async (...args: any[]) => {
      trace.push(["origin-policy", args]);
      return mode === "deny";
    },
    isHistoryBlockedByPolicy: async () => mode === "deny",
    getHistoryPermission: async () => saved,
    getFileTransferPermission: async () => saved,
    getFullCdpPermission: async () => saved,
    assertFullCdpEnabled: async () => {
      trace.push("full-cdp-config");
    },
    isWebMcpEnabled: async (...args: any[]) => {
      trace.push(["web-config", args]);
      return { enabled: mode !== "disabled", message: "disabled tools" };
    },
  };
  const runtime: any = {
    env: {},
    assertBrowserUrlAllowed: async (value: any) => {
      trace.push(["host", value]);
      if (mode === "host-deny") throw new Error("host refusal");
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ feature_status: { agent: mode === "site-deny" } }),
    }),
    createElicitation: async (request: any) => {
      trace.push(["ask", request]);
      if (mode === "page-changed") state.url = "https://other.test";
      return { action: "accept" };
    },
    otel: { log: (...args: any[]) => trace.push(["audit", args]) },
  };
  const tabs = {
      get: async (id: any) => {
        trace.push(["tab", id]);
        return state;
      },
    },
    userTabs = { openTabs: async () => [{ id: 1, url }] };
  const security = new Constructor(
    tabs,
    backend,
    preferences,
    runtime,
    noCommandTiming,
    (message: any) => message.defaultMessage,
    { browserFamily: "chrome" },
    userTabs,
  );
  siteStatus.cache.clear();
  try {
    const builder = security.createAuthorityBuilder();
    builder
      .observeContent(url)
      .readBrowsingHistory({ queries: ["one"], from: "invalid", limit: 4 })
      .uploadFiles(url)
      .downloadFiles({ type: "page-assets", pageUrl: url })
      .useCdp(url)
      .useWebMcp(
        url,
        {
          type: "webmcp_invoke_tool",
          toolOrigin: url,
          toolName: "read",
          input: {},
        },
        1,
      );
    const result = await outcome(() => builder.assert());
    return {
      result,
      trace,
      keys: Object.keys(security),
      gates: Object.keys(security.gateProviders),
      methods: Object.getOwnPropertyNames(Constructor.prototype)
        .filter((name) => name !== "constructor")
        .map((name) => [
          name,
          Object.getOwnPropertyDescriptor(Constructor.prototype, name)!.value
            .length,
        ]),
      embedded: [
        security.createAuthorityBuilder().options.isMcpApp,
        security.createAuthorityBuilder({ embeddedWebsite: true }).options
          .isMcpApp,
      ],
    };
  } finally {
    siteStatus.cache.clear();
  }
}
test("full security facade matches original provider wiring, authority execution, failures and page-change invalidation", async () => {
  for (const backend of ["extension", "iab", "mcpapps"])
    for (const mode of [
      "allowed",
      "deny",
      "disabled",
      "host-deny",
      "site-deny",
      "page-changed",
    ])
      assert.deepEqual(
        await scenario(BrowserSecurity, backend, mode),
        await scenario(original.yf, backend, mode),
      );
});
async function urls(Constructor: any, url: any, backend: string) {
  const trace: any[] = [],
    security = new Constructor(
      { get: async () => ({ url }) },
      backend,
      {
        isWebMcpEnabled: async (...args: any[]) => {
          trace.push(args);
          return { enabled: true };
        },
      },
      { env: {} },
      noCommandTiming,
      () => "",
      { browserFamily: "edge" },
      { openTabs: async () => [{ id: 1, url }] },
    );
  return {
    trace,
    results: await Promise.all([
      outcome(() => security.currentTabUrl(1)),
      outcome(() => security.currentTabFullCdpUrl(1)),
      outcome(() => security.currentUserTabUrl(1)),
      outcome(() => security.currentUserTabUrl(2)),
      outcome(() => security.currentTabFileTransferUrl(1, "download")),
      outcome(() => security.currentTabFileTransferUrl(1, "upload")),
      outcome(() => security.assertWebMcpEnabled(1)),
      outcome(() => security.getCreateElicitation()),
    ]),
  };
}
test("security current-tab/user-tab validation and settings links preserve original behavior", async () => {
  for (const url of [
    undefined,
    "",
    "  ",
    "invalid",
    "file:///tmp/page",
    "https://site.test/path",
  ])
    for (const backend of ["extension", "iab", "other"])
      assert.deepEqual(
        await urls(BrowserSecurity, url, backend),
        await urls(original.yf, url, backend),
      );
});
test("history approval projection retains single getter reads, sparse/invalid queries and date formatting", () => {
  for (const value of [
    null,
    undefined,
    3,
    [],
    {},
    { queries: ["x", 3], limit: NaN },
    { queries: new Array(2), from: "2025-01-01", to: "invalid" },
    { queries: ["x"], from: "2025-01-01", to: "2025-01-02", limit: 4 },
  ])
    assert.deepEqual(historyApprovalParams(value), original.HX(value));
  for (const fn of [historyApprovalParams, original.HX]) {
    let reads = 0;
    assert.deepEqual(
      fn({
        get limit() {
          reads++;
          return 8;
        },
      }),
      { date_range: "All history", max_results: 8 },
    );
    assert.equal(reads, 1);
  }
});
