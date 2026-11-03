import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { originalServiceBindings } from "./service-source.ts";
import { Preferences } from "../packages/browser/dist/service/preferences/preferences.js";
import { guardianOriginCache } from "../packages/browser/dist/service/preferences/guardian_cache.js";
const manifest = JSON.parse(
  readFileSync(new URL("./source-map.json", import.meta.url), "utf8"),
);
const modules = [
  "origin_patterns",
  "origin_policy",
  "network_config",
  "persisted_permissions",
  "request_context",
  "turn_caches",
  "guardian_cache",
  "prompt_results",
];
const names = [
  ...new Set<string>([
    ...modules.flatMap(
      (name) =>
        manifest.modules[`packages/browser/src/service/preferences/${name}.ts`]
          .symbols,
    ),
    "lu",
    "UC",
    "s5",
    "hS",
    "Qt",
    "Zt",
    "dl",
    "zr",
    "aC",
    "Oe",
    "qe",
    "UB",
    "IX",
    "qB",
  ]),
];
function source() {
  return originalServiceBindings(names, {
    DC: new TextEncoder(),
    OC: 42,
    X8: 63,
    SL: "approval_mode",
    Koe: "download_approval_mode",
    Xoe: "upload_approval_mode",
    Xc: "never_ask",
    $oe: "disabled",
    Hoe: "iab_history_approval_mode",
    joe: "history_approval_mode",
    xL: "origins",
    Voe: "downloads",
    zoe: "uploads",
    Goe: "full_cdp",
    iL: "browser_use_persistent_approval_scope",
    sL: "all-sites",
    Kc: "allowed",
    uu: "denied",
    bL: "disable_auto_review",
    Woe: "email_otp_approval_mode",
    yL: "webmcp",
    Ty: "webmcp_enabled",
    iC: "full_cdp_access_enabled",
    sC: "browser_use_full_cdp_access",
    np: "BROWSER_USE_FULL_CDP_ACCESS_ENABLED",
    ii: "BROWSER_USE_SECURITY_MODE",
    SC: "",
    y5: ["", "disabled-for-local-testing", "gaas-browser-environment"],
    Nn: new Map(),
    ya: undefined,
    Yc: new Map(),
    Sg: new Map(),
  });
}
function fixture(
  Class: any,
  values: any = {},
  requirements: any = {},
  local: any = {},
  runtime: any = { env: {} },
) {
  const trace: any[] = [],
    sessions = new Map<string, any>();
  const global = structuredClone(values);
  function store(value: any, label: string) {
    return {
      async get(key: string, options: any) {
        trace.push([label, "get", key, options]);
        return value[key];
      },
      async set(key: string, next: any) {
        trace.push([label, "set", key, next]);
        value[key] = next;
      },
      async update(fn: any) {
        trace.push([label, "update"]);
        Object.assign(value, fn(value));
      },
      async readSnapshot(options: any) {
        trace.push([label, "snapshot", options]);
        return structuredClone(value);
      },
    };
  }
  const config = {
    global: store(global, "global"),
    session(id: string) {
      trace.push(["session", id]);
      if (!sessions.has(id)) sessions.set(id, {});
      return store(sessions.get(id), "session");
    },
    async readRequirements() {
      trace.push("requirements");
      return { requirements };
    },
    async readAll() {
      trace.push("all");
      return { config: local };
    },
  };
  return { instance: new Class(config, runtime), trace, global, sessions };
}
async function result(action: () => Promise<any>) {
  try {
    return await action();
  } catch (error: any) {
    return {
      name: error.name,
      message: error.message,
      gate: error.gate,
      reason: error.reason,
      context: error.context,
    };
  }
}
test("Preferences full class preserves original fields, methods and config policy branches", async () => {
  const original = source();
  const methods = Object.getOwnPropertyNames(original.lu.prototype);
  assert.deepEqual(Object.getOwnPropertyNames(Preferences.prototype), methods);
  for (const name of methods.filter((name) => name !== "constructor"))
    assert.equal(
      (Preferences.prototype as any)[name].length,
      original.lu.prototype[name].length,
      name,
    );
  async function run(Class: any, values: any, requirements: any, runtime: any) {
    const f = fixture(
        Class,
        values,
        requirements,
        { browser_use: { allow_history_access: false } },
        runtime,
      ),
      o = f.instance;
    const outputs = [
      Object.keys(o),
      await o.getExtensionRequestHeaders(),
      await o.getNetworkPolicy(),
      await o.isHistoryBlockedByPolicy(),
      await o.getHistoryPermission("iab"),
      await o.getHistoryPermission("chrome"),
      await o.isAutoReviewDisabled(),
      await o.isEmailOtpAlwaysAllowed(),
      await o.fullCdpAccessState(),
      await result(() => o.assertFullCdpEnabled()),
      await o.isFullCdpEnabled(),
    ];
    await o.handleHistoryPromptResult(
      { action: "accept", _meta: { persist: "always" } },
      "iab",
    );
    return { outputs, trace: f.trace, global: f.global };
  }
  for (const env of [
    {},
    { BROWSER_USE_SECURITY_MODE: " gaas-browser-environment " },
    {
      BROWSER_USE_SECURITY_MODE: "gaas-browser-environment",
      BROWSER_USE_FULL_CDP_ACCESS_ENABLED: "1",
    },
    { BROWSER_USE_SECURITY_MODE: "unknown" },
  ])
    for (const enabled of [true, false]) {
      const values = {
        full_cdp_access_enabled: enabled,
        origins: { denied: ["a.com", 1] },
        iab_history_approval_mode: "never_ask",
        history_approval_mode: "disabled",
        email_otp_approval_mode: "never_ask",
      };
      const requirements = {
        featureRequirements: { browser_use_full_cdp_access: enabled },
        browserUse: {
          extension: { requestHeaders: { "X-Fixture": "test" } },
          allowGlobalPersistentApproval: enabled,
        },
      };
      assert.deepEqual(
        await run(Preferences, values, requirements, { env }),
        await run(original.lu, values, requirements, { env }),
      );
    }
});
test("Preferences Site tools refresh and matching retain malformed/default/denied cases", async () => {
  const original = source();
  for (const values of [
    {},
    { webmcp_enabled: false },
    {
      webmcp: {
        allowed: ["https://example.com"],
        denied: ["https://example.com"],
      },
    },
    {
      webmcp_enabled: false,
      webmcp: { allowed: ["file:///tmp/*", "example.com"] },
    },
    { webmcp: [] },
    { webmcp: { denied: [1] } },
    { webmcp_enabled: "false" },
  ])
    for (const origin of [
      "https://example.com/path",
      "file:///tmp/a?q=x",
      "codex-sandbox://a.web-sandbox.oaiusercontent.com",
      "invalid",
    ]) {
      const a = fixture(Preferences, values),
        b = fixture(original.lu, values);
      assert.deepEqual(
        await a.instance.isWebMcpEnabled(origin, "https://settings.local"),
        await b.instance.isWebMcpEnabled(origin, "https://settings.local"),
      );
      assert.deepEqual(a.trace, b.trace);
    }
});
test("Preferences assembled prompt→store/cache→decision round trip preserves v1/v2 and policy gates", async () => {
  async function run(Class: any, v2: boolean) {
    const runtime = {
      env: {},
      requestMeta: {
        "x-codex-turn-metadata": {
          session_id: v2 ? "prefs_v2" : "prefs_v1",
          turn_id: "turn",
          thread_id: "thread",
          node_repl_auto_review_required: v2,
        },
      },
    };
    const f = fixture(Class, {}, {}, {}, runtime),
      o = f.instance,
      origin = "https://example.com";
    const outputs = [
      o.captureOriginRequestContext(origin),
      await o.getOriginPermission(origin),
    ];
    await o.handleOriginPromptResult(origin, { action: "accept" });
    outputs.push(await o.getOriginPermission(origin));
    await o.handleFullCdpPromptResult(origin, { action: "accept" });
    outputs.push(await o.getFullCdpPermission(origin));
    await o.handleFileTransferPromptResult("download", origin, {
      action: "accept",
      _meta: { persist: "always" },
    });
    outputs.push(await o.getFileTransferPermission("download", origin));
    await o.handleOriginPromptResult(origin, { action: "decline" });
    outputs.push(await o.getOriginPermission(origin));
    outputs.push(
      await o.isOriginBlockedByPolicy(origin, "access"),
      await o.isOriginAutoReviewDisabled(origin),
    );
    return {
      outputs,
      trace: f.trace,
      global: f.global,
      sessions: [...f.sessions],
    };
  }
  for (const v2 of [false, true]) {
    const original = source();
    try {
      assert.deepEqual(await run(Preferences, v2), await run(original.lu, v2));
    } finally {
      guardianOriginCache.clear();
      original.fr.clear();
    }
  }
});
