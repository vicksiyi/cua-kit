import test from "node:test";
import assert from "node:assert/strict";
import {
  serviceClassMethod,
  originalServiceBindings,
} from "./service-source.ts";
import { CdpEventEmitter } from "../packages/browser/dist/service/cdp/event_emitter.js";
import {
  waitForPageLoadEvent,
  navigationDisplayUrl,
} from "../packages/browser/dist/service/cdp/page_load.js";
import { BrowserUseSecurityError } from "../packages/browser/dist/service/errors/browser_security_error.js";
const b = originalServiceBindings(
  [
    "Za",
    "wte",
    "At",
    "Io",
    "jh",
    "GN",
    "VN",
    "Rv",
    "Hn",
    "Ate",
    "Pte",
    "Ote",
    "Mte",
    "Wn",
  ],
  { St: BrowserUseSecurityError },
);
const original = new Function(
  ...Object.keys(b),
  "return {" + serviceClassMethod("qh", "waitForPageLoadEvent") + "}",
)(...Object.values(b)).waitForPageLoadEvent;
test("service emitter snapshots dispatch, removes last duplicate and preserves receiver", () => {
  function run(Class: any) {
    const o = new Class(),
      trace: any[] = [];
    function second(this: any, v: any) {
      trace.push(["second", v, this === o]);
    }
    function first(this: any, v: any) {
      trace.push(["first", v, this === o]);
      o.removeListener("x", second);
      o.on("x", () => trace.push("later"));
    }
    o.on("x", first).on("x", second).on("x", second);
    o.removeListener("x", second);
    const results = [o.emit("none"), o.emit("x", 1), o.emit("x", 2)];
    return { trace, results };
  }
  assert.deepEqual(run(CdpEventEmitter), run(b.Za));
});
test("navigation display URL removes credentials and sensitive suffixes exactly as source", () => {
  for (const url of [
    null,
    "bad",
    "file:///tmp/x",
    "https://u:p@example.com/?q=x#hash",
    "http://example.com/a?q=x#hash",
  ])
    assert.equal(navigationDisplayUrl(url), b.Mte(url));
});
test("page load handling matches original classification, navigation scopes and blocked errors", async () => {
  async function run(method: any, mode: string) {
    const o: any = new CdpEventEmitter();
    o.mainFrameIdsByTabId = new Map([[1, "main"]]);
    const target = mode === "nested" ? { tabId: 1, sessionId: "s" } : 1;
    const pending = method
      .call(o, target, {
        classificationTimeoutMs: 2,
        timeoutMs: 3,
        rejectSubframeNavigationBlocked: mode === "subblocked",
      })
      .then(
        () => ({ ok: true }),
        (e: any) => ({ error: e.message, reason: e.reason }),
      );
    const source =
      mode === "nested" ? { tabId: 1, sessionId: "s" } : { tabId: 1 };
    const emit = (name: string, params: any = {}) =>
      o.emit("event", { method: name, source, params });
    if (mode === "load") {
      emit("Page.loadEventFired");
      emit("Page.frameStartedLoading");
      emit("Page.domContentEventFired");
    }
    if (mode === "hash" || mode === "nested")
      emit("Page.navigatedWithinDocument", {
        frameId: mode === "nested" ? "child" : "main",
      });
    if (mode === "restore")
      emit("Page.frameNavigated", {
        type: "BackForwardCacheRestore",
        frame: { id: "main" },
      });
    if (mode === "ignoredhash") {
      emit("Page.frameNavigated", { frame: { id: "main" } });
      emit("Page.navigatedWithinDocument", { frameId: "main" });
    }
    if (mode === "blocked" || mode === "subblocked" || mode === "subignored")
      emit("Page.navigationBlocked", {
        resourceType: mode === "blocked" ? "Document" : "subFrame",
        url: "https://u:p@example.com/a?q=secret#hash",
      });
    const result = await pending;
    return { result, listeners: o.listeners.event.length };
  }
  for (const mode of [
    "timeout",
    "load",
    "hash",
    "nested",
    "restore",
    "ignoredhash",
    "blocked",
    "subblocked",
    "subignored",
  ])
    assert.deepEqual(
      await run(waitForPageLoadEvent, mode),
      await run(original, mode),
    );
});
test("page load classification timer switches once and repeated navigation does not finish early", async () => {
  async function run(method: any) {
    const realSet = globalThis.setTimeout,
      realClear = globalThis.clearTimeout;
    const timers = new Map<number, () => void>(),
      trace: any[] = [];
    let next = 0;
    globalThis.setTimeout = ((fn: () => void, delay: number) => {
      const id = ++next;
      timers.set(id, fn);
      trace.push(["set", id, delay]);
      return id;
    }) as any;
    globalThis.clearTimeout = ((id: number) => {
      timers.delete(id);
      trace.push(["clear", id]);
    }) as any;
    try {
      const o: any = new CdpEventEmitter();
      o.mainFrameIdsByTabId = new Map([[1, "main"]]);
      const pending = method.call(o, 1, {
        classificationTimeoutMs: 17,
        timeoutMs: 99,
      });
      const emit = (method: string, params: any = {}) =>
        o.emit("event", { method, params, source: { tabId: 1 } });
      emit("Page.loadEventFired");
      emit("Page.frameNavigated", { frame: { id: "main" } });
      emit("Page.frameStartedLoading");
      emit("Page.navigatedWithinDocument", { frameId: "main" });
      trace.push([
        "stillWaiting",
        o.listeners.event.length,
        [...timers.keys()],
      ]);
      emit("Page.domContentEventFired");
      await pending;
      return {
        trace,
        remaining: timers.size,
        listeners: o.listeners.event.length,
      };
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    }
  }
  assert.deepEqual(await run(waitForPageLoadEvent), await run(original));
});
