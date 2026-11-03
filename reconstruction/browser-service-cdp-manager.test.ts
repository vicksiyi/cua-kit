import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { createCdpManagerClass } from "../packages/browser/dist/service/cdp/manager.js";
import { classifyCommandError } from "../packages/browser/dist/service/classify_error.js";
import { BrowserUseSecurityError } from "../packages/browser/dist/service/errors/browser_security_error.js";
const Original = originalServiceBindings(
  [
    "Za",
    "wte",
    "qN",
    "_te",
    "vte",
    "eu",
    "Cv",
    "Lh",
    "$t",
    "tu",
    "Av",
    "jN",
    "Pv",
    "At",
    "Uh",
    "xte",
    "Ete",
    "HN",
    "WN",
    "Tte",
    "Cte",
    "zN",
    "Rv",
    "Hn",
    "Ate",
    "Io",
    "$N",
    "jh",
    "GN",
    "VN",
    "Pte",
    "Rte",
    "Ite",
    "kte",
    "Bte",
    "Dte",
    "Ote",
    "Wn",
    "Mte",
    "Ste",
    "qh",
  ],
  { Qa: classifyCommandError, St: BrowserUseSecurityError, Dt: () => {} },
).qh;
const Rebuilt = createCdpManagerClass(() => {});
function setup(Class: any) {
  const trace: any[] = [],
    listeners: any = {};
  const api = {
    addEventListener(name: string, fn: any) {
      listeners[name] = fn;
    },
    async attach(...args: any[]) {
      trace.push(["attach", ...args]);
    },
    async detach(tabId: number) {
      trace.push(["detach", tabId]);
      listeners.onCDPDetach({ tabId });
    },
    async executeCdp(payload: any) {
      trace.push(payload);
      if (payload.method === "Runtime.evaluate")
        return {
          result: {
            value: { href: "https://example.com", readyState: "complete" },
          },
        };
      return {};
    },
    async executeCdpWithCachedExpression() {
      return {};
    },
    async getCommittedTabUrl() {
      return "https://example.com";
    },
    async browserAuthNewTargetProtection() {
      return true;
    },
  };
  const span = {
    async withSpan(_name: any, _attrs: any, run: any) {
      return run();
    },
    currentCommandAttrs() {
      return {};
    },
  };
  const o = new Class(api, "mac", span, () => ({ policy: "fixture" }));
  return { o, trace, listeners };
}
test("assembled manager matches original instance field and prototype descriptors", () => {
  const a = setup(Rebuilt).o,
    b = setup(Original).o;
  assert.deepEqual(Object.keys(a), Object.keys(b));
  const ap = Object.getPrototypeOf(a),
    bp = Object.getPrototypeOf(b);
  assert.deepEqual(
    Object.getOwnPropertyNames(ap),
    Object.getOwnPropertyNames(bp),
  );
  for (const name of Object.getOwnPropertyNames(bp)) {
    if (name === "constructor") continue;
    const ad = Object.getOwnPropertyDescriptor(ap, name)!,
      bd = Object.getOwnPropertyDescriptor(bp, name)!;
    assert.equal(typeof ad.value, "function", name);
    assert.equal(ad.value.name, bd.value.name, name);
    assert.equal(ad.value.length, bd.value.length, name);
    assert.deepEqual(
      [ad.enumerable, ad.configurable, ad.writable],
      [bd.enumerable, bd.configurable, bd.writable],
      name,
    );
  }
  for (const name of Object.keys(b))
    assert.equal(
      Object.prototype.toString.call(a[name]),
      Object.prototype.toString.call(b[name]),
      name,
    );
});
test("assembled manager attaches, dispatches, records events, blocks dialogs and detaches like original", async () => {
  async function run(Class: any) {
    const { o, trace, listeners } = setup(Class);
    await o.call("1", "Page.test", {});
    const state = await o.readDocumentState(1);
    listeners.onCDPEvent({
      source: { tabId: 1 },
      method: "Page.javascriptDialogOpening",
      params: { type: "prompt", message: "hello" },
    });
    let blocked;
    try {
      await o.call(1, "Page.test", {});
    } catch (e) {
      blocked = (e as Error).message;
    }
    const dialog = o.getJsDialog(1);
    o.updateJsDialogPrompt(1, dialog.id, "answer");
    await o.call(1, "Page.handleJavaScriptDialog", { accept: true });
    listeners.onCDPEvent({
      source: { tabId: 1 },
      method: "Page.javascriptDialogClosed",
      params: {},
    });
    const raw = await o.readRawCdpEvents(1, { afterSequence: 0 });
    await o.detachAllTabs("turnEnded");
    return {
      trace,
      state,
      blocked,
      dialog,
      raw,
      attached: [...o.attachedTabIds],
      promises: o.tabAttachmentPromises.size,
      urls: [...o.topLevelUrlsByTabId],
      dialogs: o.jsDialogsByTabId.size,
    };
  }
  assert.deepEqual(await run(Rebuilt), await run(Original));
});
