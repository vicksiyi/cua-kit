import test from "node:test";
import assert from "node:assert/strict";
import { BrowserApi } from "../packages/browser/src/service/runtime/browser_api";
import { BrowserRpcPeer } from "../packages/browser/src/service/runtime/rpc_peer";
import {
  validateRequestHeaders,
  resolveRequestHeaders,
} from "../packages/browser/src/service/runtime/request_headers";
import { originalServiceBindings } from "./service-source";
const original = originalServiceBindings(
  ["GC", "a5", "al", "u5", "VC", "xt", "to", "id"],
  {
    $x: "executeCdpWithCachedExpression",
    F6: "No handler registered for method: executeCdpWithCachedExpression",
  },
);
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  let callback: any;
  const listeners: Function[] = [];
  let cachedCalls = 0;
  let metadata: any = { session_id: "s", turn_id: "t", orbit_id: "orbit" };
  let api: any;
  const type = mode === "cdp" ? "cdp" : mode === "iab" ? "iab" : "extension";
  const transport = {
    setMessageCallback(fn: any) {
      callback = fn;
    },
    addCloseListener(fn: any) {
      listeners.push(fn);
      return () => trace.push(["remove close"]);
    },
    async close() {
      trace.push(["close"]);
      for (const fn of listeners) fn();
    },
    sendMessage(message: any) {
      trace.push(["send", structuredClone(message)]);
      if (message.id === undefined) return;
      queueMicrotask(() => {
        let result: any = { ok: true },
          error: any;
        switch (message.method) {
          case "getInfo":
            result = {
              type,
              requestHeadersVersion: mode === "old-headers" ? 0 : 1,
              blobDownloadsSupported: true,
              sessionTabForegroundEnabled: true,
            };
            if (mode === "dot-change")
              metadata = { session_id: "s", turn_id: "changed" };
            break;
          case "executeCdpWithCachedExpression":
            cachedCalls++;
            if (mode === "cache-unsupported")
              error =
                "No handler registered for method: executeCdpWithCachedExpression";
            else if (mode === "cache-error") error = "cache failed";
            else
              result =
                (mode === "cache-refill" && cachedCalls === 1) ||
                mode === "cache-refill-failed"
                  ? { kind: "missing" }
                  : { kind: "executed", result: "cached" };
            break;
          case "getCommittedTabUrl":
            error =
              mode === "url-error"
                ? "url failed"
                : "No handler registered for method: getCommittedTabUrl";
            break;
          case "executeCdp":
            result = {
              frameTree: { frame: { url: "https://fixture.invalid/frame" } },
              targetInfo: { url: "https://fixture.invalid/target" },
            };
            break;
          case "getTabs":
            result =
              mode === "missing-tab"
                ? []
                : [{ id: 1, url: "https://fixture.invalid/tab" }];
            break;
          case "turnEnded":
            if (mode === "turn-error" || mode === "dot-turn-error")
              error = "turn failed";
            break;
        }
        callback(
          error
            ? { jsonrpc: "2.0", id: message.id, error: { message: error } }
            : { jsonrpc: "2.0", id: message.id, result },
        );
      });
    },
  };
  const Api = source ? original.id : BrowserApi;
  let headersOnce = false;
  api = new Api(
    transport,
    {
      ping() {
        return "pong";
      },
    },
    () => metadata,
    {
      track(params: any) {
        trace.push(["track", params]);
      },
    },
    async () => {
      trace.push(["headers"]);
      if (mode === "headers-ended" && !headersOnce) {
        headersOnce = true;
        await api.turnEnded({ session_id: "s", turn_id: "t" });
      }
      return mode === "invalid-headers"
        ? [{ name: "Cookie", value: "synthetic" }]
        : [{ name: "X-Synthetic", value: "{{session_id}}" }];
    },
    mode.startsWith("dot") ? "dot" : undefined,
    () => {
      trace.push(["access"]);
    },
  );
  async function attempt(name: string, fn: () => any) {
    try {
      trace.push([name, await fn()]);
    } catch (error: any) {
      trace.push([
        name + " error",
        error instanceof Error ? error.message : error,
      ]);
    }
  }
  await attempt("info", () => api.getInfo());
  await attempt("info again", () => api.getInfo());
  callback({ method: "onPageEvent", params: { kind: "synthetic" } });
  trace.push(["events", api.takePageEvents(), api.takePageEvents()]);
  for (const [method, args] of [
    ["ping", []],
    ["executeCdp", [{ method: "Runtime.evaluate" }]],
    ["browserAuthNewTargetProtection", [{}]],
    ["allowDownload", [{}]],
    ["supportsBlobDownloads", []],
    ["setBlobDownloadOrigin", [1, null]],
    ["setBlobDownloadOrigin", [1, { origin: "https://fixture.invalid" }]],
    ["attach", [1, {}]],
    ["attachBrowserUseNetworkPolicy", [1, {}]],
    ["detachBrowserUseNetworkPolicy", [1]],
    ["attachTarget", [1, "target"]],
    ["detach", [1]],
    ["detachTarget", [1, "target"]],
    ["getTabs", []],
    ["getUserTabs", []],
    ["getUserHistory", [{}]],
    ["executeTabRead", [{}]],
    ["claimUserTab", [1]],
    ["createTab", []],
    ["createTab", [3]],
    ["markTab", [1, "done"]],
    ["nameSession", ["synthetic"]],
    ["followSessionTab", [1]],
    ["executeUnhandledCommand", [{}]],
    ["moveMouse", [{}]],
  ] as any)
    await attempt(method, () => api[method](...args));
  await attempt("notification", () =>
    api.sendWebMcpToolInvoked({ name: "synthetic" }),
  );
  const request = {
    method: "Runtime.evaluate",
    commandParams: { expression: "1+1" },
  };
  await attempt("cached first", () =>
    api.executeCdpWithCachedExpression(request, "key"),
  );
  await attempt("cached second", () =>
    api.executeCdpWithCachedExpression(request, "key"),
  );
  await attempt("url first", () => api.getCommittedTabUrl(1));
  await attempt("url second", () => api.getCommittedTabUrl(1));
  if (mode === "cached-session") metadata = undefined;
  if (mode === "subagent")
    metadata = {
      thread_source: "subagent",
      thread_id: "child",
      session_id: "s",
      turn_id: "t",
    };
  trace.push(["session match", api.matchesCurrentSessionId("s")]);
  await attempt("session", () => api.getCurrentSessionId());
  await attempt("turn", () => api.getCurrentTurnId());
  api.detachTurn = async (check: any) => {
    trace.push(["detach", check()]);
    if (mode === "detach-error") throw Error("detach");
  };
  await attempt("ended", () =>
    api.turnEnded({ session_id: "s", turn_id: "t" }),
  );
  await attempt("ended again", () =>
    api.turnEnded({ session_id: "s", turn_id: "t" }),
  );
  await attempt("close", () => api.close());
  return JSON.parse(JSON.stringify(trace));
}
test("browser API matches original request payloads, cached CDP, headers, Dot and turn cleanup", async () => {
  for (const mode of [
    "normal",
    "cdp",
    "iab",
    "cache-unsupported",
    "cache-error",
    "cache-refill",
    "cache-refill-failed",
    "url-error",
    "missing-tab",
    "old-headers",
    "invalid-headers",
    "headers-ended",
    "cached-session",
    "subagent",
    "dot",
    "dot-change",
    "dot-turn-error",
    "turn-error",
    "detach-error",
  ]) {
    const actual = await run(false, mode);
    assert.deepEqual(actual, await run(true, mode), mode);
    if (mode === "headers-ended")
      assert.ok(
        actual.some(
          (row: any) =>
            row[0].endsWith(" error") &&
            row[1] === "Browser turn ended while reading request-header policy",
        ),
      );
    if (mode === "dot-turn-error")
      assert.ok(
        actual.some(
          (row: any) => row[0] === "ended error" && row[1] === "turn failed",
        ),
      );
    if (mode === "dot")
      assert.equal(
        actual.filter(
          (row: any) => row[0] === "send" && row[1].method === "getInfo",
        ).length,
        1,
      );
    if (mode === "cache-unsupported")
      assert.equal(
        actual.filter(
          (row: any) =>
            row[0] === "send" &&
            row[1].method === "executeCdpWithCachedExpression",
        ).length,
        1,
      );
  }
});
test("request header policy matches original templates, limits, denylist and returned casing", () => {
  const inputs: any[] = [
    null,
    {},
    [],
    [{ name: "X-Test", value: "{{session_id}}" }],
    [{ name: "Cookie", value: "x" }],
    [
      { name: "X", value: "a" },
      { name: "x", value: "b" },
    ],
    [{ name: "sec-x", value: "a" }],
    [{ name: "proxy-x", value: "a" }],
    [{ name: "X", value: "{bad}" }],
    [{ name: "X", value: "line\nbreak" }],
    [{ name: "X", value: "你好" }],
    [{ name: "X", value: "x", extra: true }],
    [{ name: "X", value: "x".repeat(8193) }],
    Array.from({ length: 17 }, (_, i) => ({ name: "x" + i, value: "a" })),
    [{ name: "x".repeat(257), value: "a" }],
    Array.from({ length: 5 }, (_, i) => ({
      name: "x" + i,
      value: "a".repeat(8192),
    })),
  ];
  const run = (fn: any, input: any, ...args: any[]) => {
    try {
      return fn(input, ...args);
    } catch (error: any) {
      return { error: error.message };
    }
  };
  for (const input of inputs)
    assert.deepEqual(
      run(validateRequestHeaders, input),
      run(original.VC, input),
    );
  for (const session of ["abc", "A-B", "{invalid}", "space value"])
    assert.deepEqual(
      run(
        resolveRequestHeaders,
        [{ name: "X-{{session_id}}", value: "id={{session_id}}" }],
        session,
      ),
      run(
        original.u5,
        [{ name: "X-{{session_id}}", value: "id={{session_id}}" }],
        session,
      ),
    );
});
test("RPC peer matches original requests, notifications, handler errors and transport closure", async () => {
  async function run(source: boolean) {
    const trace: any[] = [];
    let onClose: any;
    const transport = {
      setMessageCallback() {},
      addCloseListener(fn: any) {
        onClose = fn;
      },
      sendMessage(message: any) {
        trace.push(message);
        if (message.method === "send-error") throw Error("send failed");
      },
    };
    const Peer = source ? original.to : BrowserRpcPeer;
    const peer = new Peer(transport);
    peer.registerRequestHandler("echo", (value: any) => value);
    peer.registerRequestHandler("fail", () => {
      throw "failure";
    });
    await peer.handleIncomingMessage({ method: "echo", params: 3, id: 20 });
    await peer.handleIncomingMessage({ method: "fail", id: 21 });
    await peer.handleIncomingMessage({ method: "missing", id: 22 });
    const event = (value: any) => trace.push(["event", value]);
    peer.addEventListener("event", event);
    await peer.handleIncomingMessage({ method: "event", params: 4 });
    peer.removeEventListener("event", event);
    await peer.handleIncomingMessage({ method: "event", params: 5 });
    const a = peer.sendRequest("a", {});
    await peer.handleIncomingMessage({ id: 1, result: "response" });
    trace.push(await a);
    const b = peer.sendRequest("b", {}).catch((error: any) => error);
    await peer.handleIncomingMessage({ id: 2, error: {} });
    trace.push(await b);
    trace.push(
      await peer.sendRequest("send-error").catch((error: any) => error.message),
    );
    const pending = peer.sendRequest("pending").catch((error: any) => error);
    onClose({ message: "closed" });
    trace.push(await pending);
    await peer.handleIncomingMessage({ method: "echo", params: 3, id: 23 });
    trace.push(["pending", peer.pendingRequests.size]);
    return trace;
  }
  assert.deepEqual(await run(false), await run(true));
});

test("directory and discovery use restored API/peer for handshake, request and turn cleanup", async () => {
  const { createBrowserDirectoryClass, createTurnEndedTrackerClass } =
    await import("../packages/browser/src/service/runtime/browser_directory");
  const { createBrowserDiscovery } =
    await import("../packages/browser/src/service/runtime/browser_discovery");
  const { createBrowserHandshake } =
    await import("../packages/browser/src/service/runtime/browser_handshake");
  const { codexTurnMetadata } =
    await import("../packages/browser/src/service/preferences/request_context");
  const messages: any[] = [];
  let leftCallback: any, rightCallback: any, hook: any;
  const closes: Function[] = [];
  const left: any = {
    setMessageCallback(fn: any) {
      leftCallback = fn;
    },
    sendMessage(value: any) {
      messages.push(structuredClone(value));
      queueMicrotask(() => rightCallback(structuredClone(value)));
    },
    addCloseListener(fn: any) {
      closes.push(fn);
      return () => {};
    },
    async close() {
      for (const fn of closes) fn();
    },
  };
  const right: any = {
    setMessageCallback(fn: any) {
      rightCallback = fn;
    },
    sendMessage(value: any) {
      queueMicrotask(() => leftCallback(structuredClone(value)));
    },
  };
  const server = new BrowserRpcPeer(right);
  server.registerRequestHandler("getInfo", () => ({
    type: "extension",
    requestHeadersVersion: 1,
  }));
  server.registerRequestHandler("getTabs", () => [
    { id: 7, url: "https://fixture.invalid" },
  ]);
  server.registerRequestHandler("turnEnded", () => ({}));
  const runtime = {
    platform: "darwin",
    env: {},
    requestMeta: {
      "x-codex-turn-metadata": {
        session_id: "fixture-session",
        turn_id: "fixture-turn",
      },
    },
    addTurnEndedHandler(value: any) {
      hook = value;
      return () => {};
    },
  };
  const handshake = createBrowserHandshake({
    enrichProfile: async (info) => info,
    reportError(error) {
      throw error;
    },
    featureEnabled: () => false,
    deploymentEnvironment: () => "production",
  });
  const discovery = createBrowserDiscovery({
    connect: async () => left,
    readInfo: handshake.readInfo,
    span: async (_name, _attrs, perform) => perform(),
    surfaceEnabled: () => true,
    surfaceForType: (type) => type,
    reportError(error) {
      throw error;
    },
    reportDiscoveryFailure() {},
    ignoredHandshakeError: null,
    listPipes: async () => ["synthetic"],
  });
  const Directory = createBrowserDirectoryClass({
    TurnEndedTracker: createTurnEndedTrackerClass((error) => {
      throw error;
    }),
    discover: discovery.discover,
    turnMetadata: codexTurnMetadata,
    surfaceEnabled: () => false,
    assertSurfaceEnabled() {},
    connect: async () => left,
    readInfo: handshake.readInfo,
  });
  const directory = new Directory(runtime, null, {
    isFullCdpEnabled: async () => false,
    getExtensionRequestHeaders: async () => [
      { name: "X-Fixture", value: "value" },
    ],
  });
  const browser = await directory.getDefault();
  assert.ok(browser.api instanceof BrowserApi);
  assert.deepEqual(await browser.api.getTabs(), [
    { id: 7, url: "https://fixture.invalid" },
  ]);
  await hook.run({ session_id: "fixture-session", turn_id: "fixture-turn" });
  const request = messages.find((message) => message.method === "getTabs");
  assert.equal(request.params.session_id, "fixture-session");
  assert.deepEqual(request.params.request_headers, [
    { name: "X-Fixture", value: "value" },
  ]);
  assert.equal(
    messages.filter((message) => message.method === "turnEnded").length,
    1,
  );
  await directory.dispose();
  assert.equal(browser.api.closed, true);
});
