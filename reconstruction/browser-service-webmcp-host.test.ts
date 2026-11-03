import test from "node:test";
import assert from "node:assert/strict";
import { serviceExpression } from "./service-source";
import * as host from "../packages/browser/src/service/webmcp/host";

function original() {
  const names = [
    "kc",
    "dN",
    "lN",
    "Ct",
    "Es",
    "uN",
    "Xa",
    "zi",
    "kh",
    "nr",
    "pN",
    "Ev",
    "cN",
    "gte",
    "mN",
    "fN",
    "bte",
    "hN",
    "xv",
  ];
  const result = new Function(
    names
      .map((name) => `let ${name} = ${serviceExpression(name)};`)
      .join("\n") + `return {${names.join(",")}};`,
  )();
  return {
    ensureWebMcpState: result.zi,
    findWebMcpState: result.Xa,
    invalidateWebMcpState: result.pN,
    pendingWebMcpTabs: result.Ev,
    refreshWebMcpFrames: result.kh,
    fetchWebMcpTools: result.mN,
    invokeWebMcpTool: result.fN,
    sameWebMcpTarget: result.cN,
  };
}
async function scenario(source: boolean, mode: string) {
  const api = source ? original() : host;
  const trace: any[] = [],
    listeners = new Map<string, Function>(),
    cleanups: Function[] = [];
  let reads = 0,
    enabled = 0,
    evaluated = 0,
    worldCreated = 0;
  let state: any,
    base = 0;
  const emit = (method: string, params: any = {}, source: any = { tabId: 7 }) =>
    listeners.get("event")!({ method, source, params });
  const cdp: any = {
    on(name: string, listener: Function) {
      trace.push(["on", name]);
      listeners.set(name, listener);
    },
    addTabCleanupHandler(listener: Function) {
      trace.push(["cleanup-handler"]);
      cleanups.push(listener);
    },
    async call(tabId: number, method: string, params: any, options: any) {
      trace.push([method, tabId, params, options]);
      return { targetInfos: [] };
    },
    async targetForFrameOrAttach() {
      throw new Error("unexpected attach");
    },
    async callTarget(target: any, method: string, params: any, options: any) {
      let recorded = params;
      if (method === "Runtime.evaluate") {
        const last = params.expression.split("\n").at(-1)!;
        recorded = {
          ...params,
          expression: last.replace(
            /"generation":\d+/,
            '"generation":' + (state.generation - base),
          ),
        };
      }
      if (method === "Page.createIsolatedWorld")
        recorded = { ...params, worldName: "<world-name>" };
      trace.push([
        method,
        target,
        recorded,
        {
          ...options,
          ...(options?.beforeDispatch ? { beforeDispatch: "function" } : {}),
        },
      ]);
      if (method === "Page.getFrameTree") {
        reads++;
        if (mode === "attach-during-refresh" && reads === 1)
          emit("Page.frameAttached");
        if (mode === "invalidate-refresh" && reads === 1)
          emit("Page.frameNavigated", { frame: { id: "root" } });
        const frame = (id: string) => ({
          id,
          parentId: id === "root" ? undefined : "root",
          loaderId: mode === "loader-change" && reads > 1 ? "new" : "old",
          secureContextType: "Secure",
          securityOrigin: mode === "file" ? "file://" : "https://fixture.test",
          url:
            mode === "file"
              ? "file:///tmp/fixture.html?q=1"
              : "https://fixture.test/" + id,
        });
        return {
          frameTree: {
            frame: frame("root"),
            ...(mode === "same-origin-frames"
              ? { childFrames: [{ frame: frame("child") }] }
              : {}),
          },
        };
      }
      if (method === "WebMCP.enable") {
        if (mode === "enable-retry" && ++enabled === 1)
          throw new Error("enable failed");
        return {};
      }
      if (method === "Page.createIsolatedWorld") {
        if (mode === "invalidate-world") emit("Page.frameAttached");
        return { executionContextId: ++worldCreated };
      }
      if (method === "Runtime.evaluate") {
        if (mode === "dispatch-stale") emit("Page.frameAttached");
        options.beforeDispatch();
        evaluated++;
        if (mode === "exception")
          return {
            exceptionDetails: {
              text: "fallback",
              exception: { description: "evaluation failed" },
            },
          };
        if (mode === "exception-text")
          return { exceptionDetails: { text: "fallback" } };
        if (mode === "invalidate-result") emit("Page.frameAttached");
        if (params.expression.includes("\nwebMcp.invokeTool("))
          return { result: { value: { done: true } } };
        return {
          result: {
            value:
              mode === "bad-array"
                ? null
                : [
                    {
                      registration_id: mode === "bad-id" ? 2 : "r" + evaluated,
                      origin:
                        mode === "bad-origin"
                          ? "https://other.test"
                          : mode === "file"
                            ? "file://"
                            : "https://fixture.test",
                      name: "fixture",
                    },
                  ],
          },
        };
      }
      throw new Error(method);
    },
  };
  state = api.ensureWebMcpState(cdp, 7);
  base = state.generation;
  assert.equal(api.ensureWebMcpState(cdp, 7), state);
  const output: any[] = [];
  const url =
    mode === "file"
      ? "file:///tmp/fixture.html?q=1"
      : "https://fixture.test/root";
  const fetch = () =>
    api.fetchWebMcpTools(
      cdp,
      7,
      mode === "wrong-url" ? "wrong" : url,
      async (origin: string) => {
        trace.push(["authorize", origin]);
        return mode !== "denied";
      },
      mode === "attach-during-refresh",
      12345,
    );
  try {
    if (mode === "enable-retry") {
      try {
        await fetch();
      } catch (error) {
        output.push((error as Error).message);
      }
    }
    const result = await fetch();
    output.push({ ...result, generation: result.generation - base });
    if (["normal", "file", "repeat", "loader-change"].includes(mode)) {
      if (mode === "repeat")
        output.push({
          ...(await fetch()),
          generation: state.generation - base,
        });
      output.push(await api.invokeWebMcpTool(cdp, 7, "r1", undefined, 99));
    }
  } catch (error) {
    output.push((error as Error).message);
  }
  return JSON.parse(
    JSON.stringify({
      trace,
      output,
      generation: state.generation - base,
      worlds: [...state.worlds.keys()],
      registrations: [...state.registrations.keys()],
      observed: [...state.observedTargets.keys()],
      pending: !!state.pendingFrameAttachment,
      frameIds: [...state.frameIds],
    }),
  );
}
test("WebMCP host discovery/world/fetch/invoke traces match installed source", async () => {
  for (const mode of [
    "normal",
    "file",
    "repeat",
    "same-origin-frames",
    "denied",
    "wrong-url",
    "enable-retry",
    "attach-during-refresh",
    "invalidate-refresh",
    "invalidate-world",
    "dispatch-stale",
    "invalidate-result",
    "loader-change",
    "bad-array",
    "bad-id",
    "bad-origin",
    "exception",
    "exception-text",
  ])
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
});

function eventScenario(
  source: boolean,
  method: string,
  workaround: boolean,
  matching: boolean,
) {
  const api = source ? original() : host;
  const listeners = new Map<string, Function>(),
    cleanup: Function[] = [];
  const cdp: any = {
    on(name: string, listener: Function) {
      listeners.set(name, listener);
    },
    addTabCleanupHandler(fn: Function) {
      cleanup.push(fn);
    },
  };
  const state = api.ensureWebMcpState(cdp, 7),
    generation = state.generation;
  state.useChromiumCrashWorkaround = workaround;
  state.frameIds.add("known");
  state.worlds.set("known", {
    target: { tabId: 7, sessionId: "s1" },
    executionContextId: 4,
    generation,
  } as any);
  state.registrations.set("r", {} as any);
  state.observedTargets.set("s1", Promise.resolve());
  state.observedTargets.set("t1", Promise.resolve());
  state.notifiedGenerations.set("caller", generation);
  const before = api.pendingWebMcpTabs(cdp, "caller");
  if (method === "cleanup") cleanup[0](7);
  else if (method === "tabDetached") listeners.get(method)!(7);
  else
    listeners.get("event")!({
      method,
      source: { tabId: 7, sessionId: matching ? "s1" : "s2" },
      params: {
        frame: { id: matching ? "known" : "unknown" },
        frameId: matching ? "known" : "unknown",
        executionContextId: matching ? 4 : 5,
        sessionId: matching ? "s1" : "s2",
        targetId: "t1",
      },
    });
  return {
    before,
    after: api.pendingWebMcpTabs(cdp, "caller"),
    changed: state.generation !== generation,
    pending: !!state.pendingFrameAttachment,
    worlds: state.worlds.size,
    registrations: state.registrations.size,
    observed: [...state.observedTargets.keys()],
    removed: api.findWebMcpState(cdp, 7) == null,
  };
}
test("WebMCP event invalidation, deferred probe attachment and cleanup preserve original state transitions", () => {
  for (const method of [
    "WebMCP.toolsAdded",
    "WebMCP.toolsRemoved",
    "Runtime.executionContextsCleared",
    "Runtime.executionContextDestroyed",
    "Target.detachedFromTarget",
    "Page.frameAttached",
    "Page.frameNavigated",
    "Page.documentOpened",
    "Page.frameDetached",
    "unrelated",
    "cleanup",
    "tabDetached",
  ])
    for (const workaround of [false, true])
      for (const matching of [false, true])
        assert.deepEqual(
          eventScenario(false, method, workaround, matching),
          eventScenario(true, method, workaround, matching),
          `${method}/${workaround}/${matching}`,
        );
});
test("WebMCP target matching preserves session precedence and root identity", () => {
  const targets = [
    { tabId: 7 },
    { tabId: 8 },
    { tabId: 7, sessionId: "s1" },
    { tabId: 7, targetId: "t1" },
    { tabId: 7, sessionId: "s1", targetId: "t2" },
  ];
  const source = original();
  for (const a of targets)
    for (const b of targets)
      assert.equal(host.sameWebMcpTarget(a, b), source.sameWebMcpTarget(a, b));
});

test("WebMCP host and page runtime execute through real Chromium isolated world", async () => {
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
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    const listeners = new Map<string, Function>();
    // The installed WebMCP CDP domain and document.modelContext are fixture dependencies.
    // Frame discovery, isolated world creation and Runtime.evaluate use actual CDP.
    const cdp: any = {
      on(name: string, fn: Function) {
        listeners.set(name, fn);
      },
      addTabCleanupHandler() {},
      async call(_tabId: number, method: string, params: any) {
        return await session.send(method as any, params);
      },
      async callTarget(
        _target: any,
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
              async getTools() { return [{name: 'label', origin: location.origin, window, inputSchema: {type: 'object'}}]; },
              addEventListener() {},
              async executeTool(tool) { document.querySelector('#result').textContent = arguments[1].label; return {content: 'updated'}; }
            }})`,
          });
          assert.equal(fixture.exceptionDetails, undefined);
        }
        return result;
      },
      async targetForFrameOrAttach() {
        throw new Error("unexpected OOPIF");
      },
    };
    const result = await host.fetchWebMcpTools(
      cdp,
      7,
      page.url(),
      async () => true,
      false,
    );
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, "label");
    const invocation = await host.invokeWebMcpTool(
      cdp,
      7,
      result.tools[0].registration_id,
      { label: "After" },
      2000,
    );
    assert.deepEqual(invocation, { content: "updated" });
    assert.equal(await page.locator("#result").textContent(), "After");
    listeners.get("event")!({
      source: { tabId: 7 },
      method: "WebMCP.toolsRemoved",
      params: {},
    });
    await assert.rejects(
      host.invokeWebMcpTool(cdp, 7, result.tools[0].registration_id, {}, 2000),
      /registration is stale/,
    );
  } finally {
    await browser.close();
  }
});
