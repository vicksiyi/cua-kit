import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  assertWebMcpSupported,
  webMcpApprovalIntent,
} from "../packages/browser/src/service/webmcp/support";
import {
  WebMcpInvokeToolCommand,
  createWebMcpListToolsCommand,
} from "../packages/browser/src/service/commands/web_mcp";
import * as commands from "../packages/browser/src/commands/web_mcp";
import * as host from "../packages/browser/src/service/webmcp/host";
import * as catalog from "../packages/browser/src/service/webmcp/session_catalog";
import { createWebMcpToolDirectory } from "../packages/browser/src/service/webmcp/tool_directory";
import {
  approvalRuntime,
  browserDisplayName,
} from "../packages/browser/src/service/security/approval";
import { codexTurnMetadata } from "../packages/browser/src/service/preferences/request_context";
import { downloadSourceOrigin } from "../packages/browser/src/service/context/downloads";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
const originalSupport = originalServiceBindings(
  ["BA", "ai", "Ja", "rD", "uc", "tD"],
  {
    Me: codexTurnMetadata,
    Ql: { id: "webmcp" },
    oe: commands,
    ho: approvalRuntime.failCheck,
    nt: browserDisplayName,
  },
);
async function outcome(fn: () => unknown) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("WebMCP model gate and approval payload projection match original", async () => {
  for (const model of [
    undefined,
    null,
    4,
    "GPT-LUNA",
    "x-luna-more",
    "luna",
    "gpt-sol",
  ])
    for (const supported of [true, false]) {
      const run = async (original: boolean) => {
        const trace: any[] = [];
        const context: any = {
          runtime: { requestMeta: { "x-codex-turn-metadata": { model } } },
          clientInfo: { name: "Fixture" },
          async supportsTabCapability(id: string) {
            trace.push(id);
            return supported;
          },
        };
        return {
          result: await outcome(() =>
            (original ? originalSupport.Ja : assertWebMcpSupported)(
              "invoke",
              context,
            ),
          ),
          trace,
        };
      };
      assert.deepEqual(await run(false), await run(true));
    }
  const inherited = Object.create({ tool_name: "inherited", input: false });
  const array = Object.assign([], { tool_name: "array", input: 0 });
  for (const payload of [
    null,
    "x",
    3,
    [],
    array,
    inherited,
    { tool_name: " " },
    { tool_name: " tool ", input: null, tool_title: 5 },
    {
      tool_name: "fixture",
      tool_description: "",
      tool_origin: "https://fixture.test",
      input: { x: 1 },
    },
  ])
    assert.deepEqual(
      await outcome(() => webMcpApprovalIntent(payload, {})),
      await outcome(() => originalSupport.tD(payload, {})),
    );
});
async function commandScenario(original: boolean, mode: string) {
  const trace: any[] = [];
  let capabilityCalls = 0;
  const tool = {
    name: "actual-name",
    title: "Actual",
    description: "actual description",
    call_name: "tool__1",
    registration_id: "r1",
    input_schema: {},
    origin: "https://fixture.test",
  };
  const cdp: any = {
    on() {},
    addTabCleanupHandler() {},
    async call() {
      return { targetInfos: [] };
    },
    async callTarget(_target: any, method: string, params: any, options: any) {
      options?.beforeDispatch?.();
      trace.push(["cdp", method]);
      if (method === "Page.getFrameTree")
        return {
          frameTree: {
            frame: {
              id: "root",
              loaderId: "l",
              url: "https://fixture.test/",
              securityOrigin: "https://fixture.test",
              secureContextType: "Secure",
            },
          },
        };
      if (method === "WebMCP.enable") return {};
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: 1 };
      if (method === "Runtime.evaluate")
        return {
          result: {
            value: params.expression.includes("\nwebMcp.readTools(")
              ? [tool]
              : mode === "invalid-result"
                ? {}
                : mode === "null-result"
                  ? null
                  : "done",
          },
        };
      throw new Error(method);
    },
  };
  const context: any = {
    cdp,
    clientInfo: { type: "cdp", name: "Fixture", family: "chrome" },
    runtime: {
      requestMeta: {
        callId: "call",
        "x-codex-turn-metadata": {
          model: mode === "model-denied" ? "GPT-LUNA" : "sol",
        },
      },
    },
    getCurrentSessionId() {
      return "session";
    },
    async supportsTabCapability(id: string) {
      trace.push(["capability", id]);
      return (
        mode !== "capability-denied" &&
        !(mode === "capability-changed" && ++capabilityCalls > 1)
      );
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["current", id]);
        return "https://fixture.test/";
      },
      async assertWebMcpEnabled(id: number) {
        trace.push(["enabled", id]);
        return "https://fixture.test/";
      },
      async assertWebMcpOriginEnabled(origin: string) {
        trace.push(["origin", origin]);
      },
    },
    acquireAuthority() {
      trace.push(["authority"]);
      return {
        useWebMcp(url: string, intent: unknown, id: number) {
          trace.push(["use", url, intent, id]);
          return {
            async assert() {
              trace.push(["assert"]);
              if (mode === "approval-denied") throw new Error("declined");
              if (mode === "stale-after-approval")
                host.invalidateWebMcpState(host.ensureWebMcpState(cdp, 7));
            },
          };
        },
      };
    },
    sendWebMcpToolInvoked(event: unknown) {
      trace.push(["notify", event]);
    },
  };
  const dependencies: any = {
    assertSupported: assertWebMcpSupported,
    ambientNetworkDisabled() {
      return true;
    },
    async featureFlag() {
      return false;
    },
    config() {},
    emit() {},
  };
  const old = originalServiceBindings(["Mh", "TN"], {
    F: defineCommand,
    oe: commands,
    W: positiveTabId,
    Ja: assertWebMcpSupported,
    Yi: catalog.assertWebMcpPageEnabled,
    SN: catalog.assertWebMcpCatalogEnabled,
    Bc: catalog.findSessionWebMcpTool,
    qe: downloadSourceOrigin,
    tD: webMcpApprovalIntent,
    Ct: "WebMCP tool registration is stale. Call fetchTools() again.",
    fN: host.invokeWebMcpTool,
    Bh: createWebMcpToolDirectory(dependencies),
    Dh: catalog.rememberWebMcpTools,
  });
  const payload: any = {
    tab_id: mode === "bad-tab" ? "bad" : "7",
    tool_name: "spoofed",
    registration_id: "r1",
    input: { x: 1 },
    timeout_ms: 123,
  };
  let result;
  if (mode === "list")
    result = await outcome(() =>
      (original ? old.TN : createWebMcpListToolsCommand(dependencies))(
        payload,
        context,
      ),
    );
  else {
    const state = host.ensureWebMcpState(cdp, 7);
    const world: any = {
      target: { tabId: 7 },
      frameId: "root",
      generation: state.generation,
      executionContextId: 1,
    };
    state.worlds.set("root", world);
    state.registrations.set("r1", world);
    if (mode === "other-origin") tool.origin = "https://other.test";
    if (mode !== "missing")
      catalog.rememberWebMcpTools(context, 7, {
        generation: state.generation,
        tools: [tool],
      });
    if (mode === "disabled")
      catalog.ensureWebMcpCatalog(context, 7).disabled = true;
    result = await outcome(() =>
      (original ? old.Mh : WebMcpInvokeToolCommand)(payload, context),
    );
  }
  return JSON.parse(JSON.stringify({ result, trace, payload }));
}
test("WebMCP invoke/list commands preserve original authorization, metadata replacement and invalidation ordering", async () => {
  for (const mode of [
    "normal",
    "list",
    "bad-tab",
    "missing",
    "disabled",
    "other-origin",
    "model-denied",
    "capability-denied",
    "capability-changed",
    "approval-denied",
    "stale-after-approval",
    "invalid-result",
    "null-result",
  ])
    assert.deepEqual(
      await commandScenario(false, mode),
      await commandScenario(true, mode),
      mode,
    );
});

test("assembled WebMCP list/approve/invoke chain changes Chromium DOM", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://webmcp.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<button id="result">Before</button>',
      }),
    );
    await page.goto("https://webmcp.test/");
    const session = await page.context().newCDPSession(page);
    const trace: any[] = [];
    const cdp: any = {
      on() {},
      addTabCleanupHandler() {},
      async call(_id: number, method: string, params: any) {
        return session.send(method as any, params);
      },
      async callTarget(
        _target: unknown,
        method: string,
        params: any,
        options: any,
      ) {
        options?.beforeDispatch?.();
        if (method === "WebMCP.enable") return {};
        const result: any = await session.send(method as any, params);
        if (method === "Page.createIsolatedWorld") {
          const fixture = await session.send("Runtime.evaluate", {
            contextId: result.executionContextId,
            expression: `Object.defineProperty(document, 'modelContext', {value: {
            async getTools() { return [{ name: 'set-label', title: 'Set label', origin: location.origin, window, inputSchema: {type: 'object'} }]; },
            addEventListener() {},
            async executeTool(tool) { document.querySelector('#result').textContent = arguments[1].label; return 'updated'; }
          }})`,
          });
          assert.equal(fixture.exceptionDetails, undefined);
        }
        return result;
      },
    };
    const context: any = {
      cdp,
      clientInfo: { type: "cdp", name: "Fixture" },
      runtime: {},
      getCurrentSessionId() {
        return "session";
      },
      async supportsTabCapability() {
        return true;
      },
      security: {
        async currentTabUrl() {
          return page.url();
        },
        async assertWebMcpEnabled() {
          return page.url();
        },
        async assertWebMcpOriginEnabled() {
          throw new Error("unexpected cross origin");
        },
      },
      acquireAuthority() {
        return {
          useWebMcp(_url: string, intent: any) {
            return {
              async assert() {
                trace.push(["approval", intent.type, intent.toolName]);
              },
            };
          },
        };
      },
      sendWebMcpToolInvoked(event: any) {
        trace.push(["invoked", event.toolName]);
      },
    };
    const list = createWebMcpListToolsCommand({
      ambientNetworkDisabled() {
        return true;
      },
      async featureFlag() {
        return false;
      },
      config() {
        return undefined;
      },
      emit() {},
    });
    const fetched = await list({ tab_id: "7" }, context);
    const result = await WebMcpInvokeToolCommand(
      {
        tab_id: "7",
        registration_id: fetched.tools[0].registration_id,
        tool_name: "spoofed",
        input: { label: "After" },
        timeout_ms: 2000,
      },
      context,
    );
    assert.deepEqual(result, { result: "updated" });
    assert.equal(await page.locator("#result").textContent(), "After");
    assert.deepEqual(trace, [
      ["approval", "webmcp_list_tools", undefined],
      ["approval", "webmcp_invoke_tool", "set-label"],
      ["invoked", "set-label"],
    ]);
  } finally {
    await browser.close();
  }
});
