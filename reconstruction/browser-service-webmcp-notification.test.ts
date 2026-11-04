import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createWebMcpNotifications,
  isWebMcpChangedEvent,
  formatWebMcpToolsNotification,
} from "../packages/browser/src/service/webmcp/notifications";
import * as host from "../packages/browser/src/service/webmcp/host";
import * as catalog from "../packages/browser/src/service/webmcp/session_catalog";
import { createWebMcpToolDirectory } from "../packages/browser/src/service/webmcp/tool_directory";
import { assertWebMcpSupported } from "../packages/browser/src/service/webmcp/support";
import { WebMcpListTools } from "../packages/browser/src/commands/web_mcp";
import { toWebMcpToolDescriptor } from "../packages/browser/src/capabilities/tab_web_mcp";
import { staleWebMcpRegistration } from "../packages/browser/src/service/webmcp/frame_discovery";
const tool = {
  name: "label",
  call_name: "label__1",
  registration_id: "r",
  input_schema: {},
  origin: "https://fixture.test",
};
function original(dependencies: any) {
  return originalServiceBindings(["aA", "$ue", "s6", "i6"], {
    sA: { version: 1, type: "webmcp_changed" },
    Ni: toWebMcpToolDescriptor,
    oe: { WebMcpListTools },
    Ja: assertWebMcpSupported,
    Yi: catalog.assertWebMcpPageEnabled,
    Bh: createWebMcpToolDirectory({
      ...dependencies,
      assertSupported: assertWebMcpSupported,
    }),
    Dh: catalog.rememberWebMcpTools,
    Oh: catalog.webMcpDescriptorIdentity,
    Ev: host.pendingWebMcpTabs,
    vN: catalog.pollWebMcpSessionTab,
    Ct: staleWebMcpRegistration,
    Wue: 250,
    _x: new WeakMap(),
  });
}
async function scenario(source: boolean, mode: string) {
  const trace: any[] = [];
  let attempts = 0;
  const cdp: any = {
    on() {},
    addTabCleanupHandler() {},
    async call() {
      return { targetInfos: [] };
    },
    async callTarget(target: any, method: string, params: any, options: any) {
      options?.beforeDispatch?.();
      trace.push(["cdp", target.tabId, method]);
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
            value: mode === "empty" || mode === "removed" ? [] : [tool],
          },
        };
      throw new Error(method);
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
      trace.push(["support"]);
      return mode !== "unsupported";
    },
    security: {
      async assertWebMcpEnabled(id: number) {
        trace.push(["enabled", id]);
        return "https://fixture.test/";
      },
      async assertWebMcpOriginEnabled() {},
    },
    acquireAuthority() {
      return {
        useWebMcp(_url: string, _intent: any, id: number) {
          return {
            async assert() {
              trace.push(["authority", id]);
              attempts++;
              if (
                mode === "retry-always" ||
                (mode === "retry-once" && attempts === 1)
              )
                throw new Error(staleWebMcpRegistration);
              if (mode === "denied") throw new Error("denied");
            },
          };
        },
      };
    },
  };
  const dependencies: any = {
    ambientNetworkDisabled() {
      return true;
    },
    async featureFlag() {
      return false;
    },
    config() {},
    emit() {},
  };
  const api = source
    ? original(dependencies).i6
    : createWebMcpNotifications(dependencies).collect;
  if (["same", "removed", "pending", "poll"].includes(mode)) {
    const state = host.ensureWebMcpState(cdp, 7);
    catalog.rememberWebMcpTools(context, 7, {
      generation: state.generation,
      tools: [tool],
    });
    if (mode === "pending") host.invalidateWebMcpState(state);
  }
  const events = [
    "pending",
    "poll",
    "no-tabs",
    "external",
    "internal",
  ].includes(mode)
    ? []
    : [{ version: 1, type: "webmcp_changed", tabId: 7 }];
  if (mode === "ordered")
    events.push({ version: 1, type: "webmcp_changed", tabId: 8 }, events[0]);
  const lifecycle =
    mode === "external" || mode === "internal"
      ? [{ type: "tab_acquired", origin: mode, tabId: 7 }]
      : [];
  const output = await api(
    events,
    lifecycle,
    context,
    Date.now() + (mode === "expired" ? -1 : 5000),
  );
  return { output, trace };
}
test("WebMCP notifications match original changes, removal, deduplication, polling and bounded retry", async () => {
  for (const mode of [
    "normal",
    "empty",
    "same",
    "removed",
    "pending",
    "poll",
    "no-tabs",
    "external",
    "internal",
    "ordered",
    "expired",
    "unsupported",
    "denied",
    "retry-once",
    "retry-always",
  ])
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
});
test("WebMCP notification event validation and callable-name formatting match source", () => {
  const old = original({});
  for (const event of [
    {},
    { version: 1, type: "webmcp_changed", tabId: 7 },
    { version: "1", type: "webmcp_changed", tabId: 7 },
    ...[0, -1, 1.5, NaN, Infinity, "7"].map((tabId) => ({
      version: 1,
      type: "webmcp_changed",
      tabId,
    })),
  ])
    assert.equal(isWebMcpChangedEvent(event), old.aA(event));
  assert.equal(formatWebMcpToolsNotification(7, [tool]), old.$ue(7, [tool]));
});

test("WebMCP background polls are shared and late completion does not leak notifications", async () => {
  async function run(source: boolean, expire: boolean) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const trace: string[] = [];
    const cdp: any = { on() {}, addTabCleanupHandler() {} };
    const context: any = {
      cdp,
      runtime: {},
      clientInfo: { name: "Fixture" },
      getCurrentSessionId() {
        return "session";
      },
      async supportsTabCapability() {
        trace.push("support");
        return false;
      },
      security: {
        async assertWebMcpEnabled() {
          trace.push("poll");
          await gate;
          return "https://fixture.test/";
        },
      },
    };
    const state = host.ensureWebMcpState(cdp, 7);
    catalog.rememberWebMcpTools(context, 7, {
      generation: state.generation,
      tools: [tool],
    });
    const dependencies: any = {};
    const collect = source
      ? original(dependencies).i6
      : createWebMcpNotifications(dependencies).collect;
    const deadline = Date.now() + (expire ? 30 : 5000);
    const first = collect([], [], context, deadline);
    const second = await collect([], [], context, deadline);
    assert.deepEqual(trace, ["poll"]);
    let output;
    if (expire) {
      output = await first;
      release();
      await new Promise((resolve) => setTimeout(resolve, 10));
    } else {
      release();
      output = await first;
    }
    return { second, output, trace };
  }
  for (const expire of [false, true])
    assert.deepEqual(await run(false, expire), await run(true, expire));
});

test("browser notification queue preserves drain order, session filtering and post-collection visibility", async () => {
  const { createBrowserNotificationQueue } =
    await import("../packages/browser/src/service/webmcp/notification_queue");
  async function run(source: boolean, mode: string) {
    const trace: any[] = [];
    let visible = mode !== "hidden-before";
    const eventSource: any = {
      takePageEvents() {
        trace.push("pages");
        return [
          { version: 1, session_id: "a" },
          { version: 2, session_id: "a" },
          { version: 1, session_id: "b" },
        ];
      },
      matchesCurrentSessionId(id: string) {
        trace.push(["session", id]);
        return id === "a";
      },
    };
    const context: any = {
      label: "first",
      tabLifecycle: {
        takeEvents() {
          trace.push("lifecycle");
          return [{ type: "tab_acquired" }];
        },
      },
    };
    const collector = async (
      events: any[],
      lifecycle: any[],
      ctx: any,
      deadline: number,
    ) => {
      assert.ok(deadline > Date.now());
      trace.push(["collect", events, lifecycle, ctx.label]);
      if (mode === "hidden-after") visible = false;
      if (mode === "throw") throw new Error("collector failed");
      return mode === "empty" ? [] : ["one", "two"];
    };
    const deps: any = {
      collectors: [collector],
      canObserve() {
        trace.push("visible");
        return visible;
      },
      async canPublish() {
        trace.push("publish");
        return mode !== "publish-denied";
      },
    };
    const old = originalServiceBindings(["a6", "u6"], {
      vx: new Map(),
      Gue: deps.collectors,
      Je: deps.canObserve,
      $o: deps.canPublish,
    });
    const queue = source
      ? { enqueue: old.a6, flush: old.u6 }
      : createBrowserNotificationQueue(deps);
    queue.enqueue(eventSource, context);
    if (mode === "replace")
      queue.enqueue(eventSource, { ...context, label: "replacement" });
    let result;
    try {
      result = await queue.flush();
    } catch (error) {
      result = (error as Error).message;
    }
    const second = await queue.flush();
    return { result, second, trace };
  }
  for (const mode of [
    "normal",
    "replace",
    "hidden-before",
    "hidden-after",
    "publish-denied",
    "empty",
    "throw",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
});
