import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { createPageClipboardBridgeClass } from "../packages/browser/dist/service/context/clipboard_bridge.js";
import { createClipboardClass } from "../packages/browser/dist/service/context/clipboard.js";
import { CdpEventEmitter } from "../packages/browser/dist/service/cdp/event_emitter.js";
const installer = (name: string) => `install:${name}`;
const Original = originalServiceBindings(["DL", "OL", "kL", "BL", "xg"], {
  IL: installer,
}).xg;
const Rebuilt = createPageClipboardBridgeClass(installer);
function setup(Class: any, fail?: string) {
  const trace: any[] = [];
  const cdp: any = new CdpEventEmitter();
  cdp.addTabCleanupHandler = (fn: any) => {
    cdp.cleanup = fn;
    return () => trace.push("remove-cleanup");
  };
  cdp.callTarget = async (target: any, method: string, params: any) => {
    trace.push({ target, method, params });
    if (method === fail) throw Error("provider failure");
    return method === "Page.addScriptToEvaluateOnNewDocument"
      ? { identifier: "script" }
      : { result: { value: true } };
  };
  const Store = createClipboardClass(Class),
    store = new Store();
  return { trace, cdp, store };
}
function stable(value: any) {
  return JSON.parse(
    JSON.stringify(value).replace(
      /__browserUseClipboard_[a-f0-9]{32}/g,
      "__browserUseClipboard_ID",
    ),
  );
}
test("page clipboard bridge shares install, routes bindings and cleans up original CDP sequence", async () => {
  async function run(Class: any) {
    const { trace, cdp, store } = setup(Class);
    await Promise.all([
      store.ensurePageClipboard(cdp, { tabId: 1 }),
      store.ensurePageClipboard(cdp, { tabId: 1 }),
    ]);
    const bridge: any = store.bridges.get(cdp);
    const state = bridge.installations.get("1:");
    for (const payload of [
      "bad",
      "{}",
      '{"id":1}',
      '{"id":2,"operation":"other"}',
      JSON.stringify({
        id: 3,
        operation: "write",
        items: [{ entries: [{ mime_type: "text/plain", text: "hello" }] }],
      }),
      " bad ",
      JSON.stringify({ id: 4, operation: "read" }),
    ])
      cdp.emit("event", {
        method: "Runtime.bindingCalled",
        source: { tabId: 1 },
        params: { name: state.bindingName, executionContextId: 9, payload },
      });
    await Promise.resolve();
    const items = store.read();
    await store.dispose();
    return stable({
      trace,
      items,
      installations: bridge.installations.size,
      listeners: Object.values(cdp.listeners).map((v: any) => v.length),
    });
  }
  assert.deepEqual(await run(Rebuilt), await run(Original));
});
test("page clipboard installation failure cleans only established resources", async () => {
  async function run(Class: any, fail: string) {
    const { trace, cdp, store } = setup(Class, fail);
    let error;
    try {
      await store.ensurePageClipboard(cdp, { tabId: 1, sessionId: "s" });
    } catch (e) {
      error = (e as Error).message;
    }
    const bridge: any = store.bridges.get(cdp);
    return stable({ trace, error, size: bridge.installations.size });
  }
  for (const fail of [
    "Runtime.addBinding",
    "Page.addScriptToEvaluateOnNewDocument",
    "Runtime.evaluate",
  ])
    assert.deepEqual(await run(Rebuilt, fail), await run(Original, fail));
});
test("page clipboard detach invalidates only matching tabs and ensure replaces the installation", async () => {
  async function run(Class: any) {
    const { trace, cdp, store } = setup(Class);
    await store.ensurePageClipboard(cdp, { tabId: 1 });
    await store.ensurePageClipboard(cdp, { tabId: 10, targetId: "t" });
    const bridge: any = store.bridges.get(cdp);
    const old = bridge.installations.get("1:");
    cdp.emit("tabDetached", 1);
    const flags = [
      old.invalidated,
      bridge.installations.get("10:target:t").invalidated,
    ];
    await store.ensurePageClipboard(cdp, { tabId: 1 });
    const replaced = bridge.installations.get("1:") !== old;
    const first = bridge.dispose(),
      second = bridge.dispose();
    const same = first === second;
    await first;
    let error;
    try {
      await bridge.ensure({ tabId: 1 });
    } catch (e) {
      error = (e as Error).message;
    }
    return stable({ trace, flags, replaced, same, error });
  }
  assert.deepEqual(await run(Rebuilt), await run(Original));
});
