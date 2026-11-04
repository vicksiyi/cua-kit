import test from "node:test";
import assert from "node:assert/strict";
import { serviceExpression } from "./service-source";
import * as catalog from "../packages/browser/src/service/webmcp/session_catalog";
import * as host from "../packages/browser/src/service/webmcp/host";
import { createWebMcpToolDirectory } from "../packages/browser/src/service/webmcp/tool_directory";
import { AuthorityGateError } from "../packages/browser/src/service/errors/authority_gate_error";
import { WebMcpListTools } from "../packages/browser/src/commands/web_mcp";
import { toWebMcpToolDescriptor } from "../packages/browser/src/capabilities/tab_web_mcp";
import { downloadSourceOrigin } from "../packages/browser/src/service/context/downloads";
function original(external: Record<string, any> = {}) {
  const names = [
    "Ya",
    "gN",
    "bN",
    "yN",
    "Ki",
    "Xi",
    "wN",
    "Dh",
    "_N",
    "vN",
    "Yi",
    "SN",
    "Bc",
    "Oh",
    "xN",
    "EN",
    "Bh",
  ];
  return new Function(
    ...Object.keys(external),
    names.map((name) => `let ${name}=${serviceExpression(name)};`).join("\n") +
      `return {${names.join(",")}};`,
  )(...Object.values(external));
}
const tool = (name = "fixture", origin = "https://fixture.test") => ({
  name,
  call_name: name + "__1",
  registration_id: "r",
  input_schema: { type: "object" },
  origin,
});
async function sessionScenario(source: boolean, mode: string) {
  const events: Function[] = [],
    trace: any[] = [];
  let sessionId = "a",
    deny = false;
  const cdp: any = {
    on(name: string, fn: Function) {
      if (name === "event") events.push(fn);
    },
    addTabCleanupHandler() {},
  };
  const context: any = {
    cdp,
    getCurrentSessionId: () => sessionId,
    security: {
      async assertWebMcpEnabled(id: number) {
        trace.push(["check", id]);
        if (deny)
          throw mode === "plain-error"
            ? new Error("denied")
            : new AuthorityGateError(
                mode === "other-gate" ? "other" : "webMcpConfiguration",
                "test",
                "denied",
              );
        return "https://fixture.test/";
      },
    },
  };
  const originalApi = original({
    Xa: host.findWebMcpState,
    nr: host.assertWebMcpGeneration,
    Oe: AuthorityGateError,
  });
  const api = source
    ? {
        ensure: originalApi.EN,
        remember: originalApi.Dh,
        find: originalApi.Bc,
        clear: originalApi.xN,
        clearAll: originalApi._N,
        poll: originalApi.vN,
        enabled: originalApi.Yi,
        assert: originalApi.SN,
      }
    : {
        ensure: catalog.ensureWebMcpCatalog,
        remember: catalog.rememberWebMcpTools,
        find: catalog.findSessionWebMcpTool,
        clear: catalog.clearWebMcpTabSessions,
        clearAll: catalog.clearWebMcpSessions,
        poll: catalog.pollWebMcpSessionTab,
        enabled: catalog.assertWebMcpPageEnabled,
        assert: catalog.assertWebMcpCatalogEnabled,
      };
  const state = host.ensureWebMcpState(cdp, 7),
    remembered = api.ensure(context, 7);
  const data = { generation: state.generation, tools: [tool()] };
  const output: any[] = [api.remember(context, 7, data)];
  data.tools[0].name = "mutated";
  output.push(api.find(context, 7, "r")?.name);
  sessionId = "b";
  output.push(api.find(context, 7, "r"));
  output.push(
    api.remember(context, 7, {
      generation: state.generation,
      tools: [tool("second")],
    }),
  );
  sessionId = "a";
  if (mode === "stale") host.invalidateWebMcpState(state);
  if (mode === "disabled") remembered.disabled = true;
  try {
    output.push(api.assert(context, 7));
  } catch (e) {
    output.push((e as Error).message);
  }
  output.push(api.find(context, 7, "r")?.name);
  output.push(
    api.remember(context, 7, {
      generation: state.generation,
      tools: [tool("replacement")],
    }),
  );
  if (mode === "clear") api.clear(context, 7);
  if (mode === "clear-all") api.clearAll(context);
  if (["denied", "other-gate", "plain-error"].includes(mode)) {
    deny = true;
    try {
      await api.enabled(context, 7);
    } catch (e) {
      output.push((e as Error).message);
    }
  }
  if (mode.startsWith("navigation")) {
    remembered.disabled = true;
    remembered.registrationChanges = 8;
    remembered.snapshot = { tools: [tool()], deniedOrigins: new Set() };
    const event = {
      method: "Page.frameNavigated",
      source: {
        tabId: 7,
        ...(mode === "navigation-nested" ? { sessionId: "child" } : {}),
      },
      params: {
        frame: {
          id: "root",
          ...(mode === "navigation-child" ? { parentId: "parent" } : {}),
        },
      },
    };
    events.forEach((fn) => fn(event));
  }
  const second = host.ensureWebMcpState(cdp, 8);
  api.remember(context, 8, { generation: second.generation, tools: [] });
  output.push(
    await api.poll(context),
    await api.poll(context),
    await api.poll(context),
  );
  return JSON.parse(
    JSON.stringify({
      output,
      trace,
      disabled: remembered.disabled,
      changes: remembered.registrationChanges,
      snapshot: !!remembered.snapshot,
      sessions: [...remembered.toolsBySession].map(([id, result]: any) => [
        id,
        result.tools,
      ]),
      notifications: [...state.notifiedGenerations.keys()],
    }),
  );
}
test("WebMCP per-session catalogs match original clone, revocation, navigation and polling behavior", async () => {
  for (const mode of [
    "normal",
    "stale",
    "disabled",
    "clear",
    "clear-all",
    "denied",
    "other-gate",
    "plain-error",
    "navigation",
    "navigation-child",
    "navigation-nested",
  ])
    assert.deepEqual(
      await sessionScenario(false, mode),
      await sessionScenario(true, mode),
      mode,
    );
});
async function directoryScenario(source: boolean, mode: string) {
  const trace: any[] = [],
    callbacks: Function[] = [];
  let round = 0,
    pageChecks = 0;
  const origin =
    mode === "file"
      ? "file://"
      : mode.startsWith("origin-")
        ? "https://other.test"
        : "https://fixture.test";
  const pageUrl =
    mode === "file" ? "file:///tmp/fixture.html?q=1" : "https://fixture.test/";
  const cdp: any = {
    on(name: string, fn: Function) {
      if (name === "event") callbacks.push(fn);
    },
    addTabCleanupHandler() {},
    async call() {
      return { targetInfos: [] };
    },
    async callTarget(_target: any, method: string, params: any, options: any) {
      options?.beforeDispatch?.();
      if (method === "Page.getFrameTree")
        return {
          frameTree: {
            frame: {
              id: "root",
              loaderId: "l",
              url: pageUrl,
              securityOrigin: origin,
              secureContextType: "Secure",
            },
          },
        };
      if (method === "WebMCP.enable") return {};
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: 1 };
      if (method === "Runtime.evaluate") {
        const tools = [
          tool(mode === "changes" && round > 0 ? "changed" : "fixture", origin),
        ];
        if (mode === "bad-schema") delete (tools[0] as any).call_name;
        if (mode === "no-origin") delete (tools[0] as any).origin;
        return { result: { value: tools } };
      }
      throw new Error(method);
    },
  };
  const context: any = {
    cdp,
    clientInfo: { type: "cdp" },
    runtime: { gaas: {} },
    getCurrentSessionId: () => "session",
    security: {
      async assertWebMcpEnabled(id: number) {
        trace.push(["page", id]);
        pageChecks++;
        return mode === "url-changed" && pageChecks > 1
          ? "https://other.test/"
          : pageUrl;
      },
      async assertWebMcpOriginEnabled(origin: string) {
        trace.push(["origin", origin]);
        if (mode === "origin-error") throw new Error("origin error");
        if (mode === "origin-denied")
          throw new AuthorityGateError("webMcpConfiguration", "test", "denied");
      },
    },
  };
  const deps: any = {
    async assertSupported(command: string) {
      trace.push(["support", command]);
    },
    ambientNetworkDisabled() {
      trace.push(["local"]);
      return mode === "local";
    },
    async featureFlag(name: string, deadline: number) {
      trace.push(["flag", name, deadline]);
      return false;
    },
    config(name: string) {
      trace.push(["config", name]);
      return {
        get(key: string, fallback: number) {
          return mode === "count" && key === "max_tools"
            ? 0
            : mode === "bytes" && key === "max_total_descriptor_bytes"
              ? 0
              : mode === "changes" && key === "max_registration_changes"
                ? 0
                : fallback;
        },
      };
    },
    emit(_runtime: any, event: string, reason: string, data: any) {
      trace.push(["emit", event, reason, data]);
    },
  };
  const old = original({
    Ja: deps.assertSupported,
    zi: host.ensureWebMcpState,
    Xa: host.findWebMcpState,
    nr: host.assertWebMcpGeneration,
    mN: host.fetchWebMcpTools,
    oe: { WebMcpListTools },
    Oe: AuthorityGateError,
    qe: downloadSourceOrigin,
    Ar: deps.ambientNetworkDisabled,
    gh: deps.featureFlag,
    $M: deps.config,
    dt: deps.emit,
    Ni: toWebMcpToolDescriptor,
    Ct: "WebMCP tool registration is stale. Call fetchTools() again.",
  });
  const fetch = source ? old.Bh : createWebMcpToolDirectory(deps);
  const getState = source ? old.EN : catalog.ensureWebMcpCatalog;
  const out: any[] = [];
  for (round = 0; round < 2; round++) {
    try {
      const result = await fetch(context, 7, 42);
      out.push(result.tools);
    } catch (e) {
      out.push(
        e instanceof Error && e.name === "ZodError"
          ? "schema-error"
          : (e as Error).message,
      );
    }
  }
  const state = getState(context, 7);
  return JSON.parse(
    JSON.stringify({
      out,
      trace,
      disabled: state.disabled,
      changes: state.registrationChanges,
      snapshot: state.snapshot && {
        tools: state.snapshot.tools,
        denied: [...state.snapshot.deniedOrigins],
      },
    }),
  );
}
test("WebMCP directory uses actual host and matches original count/byte/change limits and permission ordering", async () => {
  for (const mode of [
    "normal",
    "file",
    "local",
    "count",
    "bytes",
    "changes",
    "bad-schema",
    "no-origin",
    "url-changed",
    "origin-denied",
    "origin-error",
  ])
    assert.deepEqual(
      await directoryScenario(false, mode),
      await directoryScenario(true, mode),
      mode,
    );
});
test("WebMCP default limits, nullish overrides and UTF-8 descriptor sizing match original", () => {
  const old = original();
  for (const value of [undefined, null, 0, -1, 5]) {
    const config = {
      get() {
        return value;
      },
    };
    assert.deepEqual(catalog.webMcpLimits(config), old.bN(config));
  }
  for (const value of [undefined, null, [], { text: "中文😀", a: undefined }])
    assert.equal(catalog.webMcpDescriptorBytes(value), old.yN(value));
  assert.equal(catalog.webMcpDisabledMessage, old.Ki);
});
