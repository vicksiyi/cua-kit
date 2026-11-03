import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  serviceClassMethod,
  originalServiceBindings,
} from "./service-source.ts";
import {
  registerCdpEventBridge,
  enableOopifAutoAttach,
} from "../packages/browser/dist/service/cdp/event_bridge.js";
import { rawEventMethods } from "../packages/browser/dist/service/cdp/raw_event_methods.js";
import { lifecycleMethods } from "../packages/browser/dist/service/cdp/lifecycle_methods.js";
const Original = new Function(
  "Base",
  "return class extends Base {" + serviceClassMethod("qh", "constructor") + "}",
);
function create(original: boolean) {
  const trace: any[] = [],
    handlers: any = {},
    attach: any[] = [],
    cleanup: any[] = [];
  const api = {
    addEventListener(name: string, fn: any) {
      trace.push(["subscribe", name]);
      handlers[name] = fn;
    },
  };
  class Base extends EventEmitter {
    tabAttachmentPromises = new Map([[9, Promise.resolve()]]);
    attachedTabIds = new Set([1]);
    frameSessionsBySessionId = new Map([
      ["s", { target: { tabId: 1 }, targetId: "t" }],
    ]);
    frameSessionsByTabId = new Map();
    rawCdpEventsByTabId = new Map();
    rawCdpEventEvictedThroughSequenceByTabId = new Map();
    rawCdpEventSequenceByTabId = new Map();
    protected = false;
    internal = false;
    forgetAttachedTab(id: number) {
      trace.push(["forget", id]);
    }
    isInternalScreencastEvent() {
      trace.push("internal");
      return this.internal;
    }
    hasBrowserAuthRawEventProtection() {
      trace.push("protected");
      return this.protected;
    }
    handleTargetEvent(e: any) {
      trace.push(["target", e]);
    }
    handleJavaScriptDialogEvent(e: any) {
      trace.push(["dialog", e]);
    }
    addTabAttachHandler(fn: any) {
      attach.push(fn);
    }
    addTabCleanupHandler(fn: any) {
      cleanup.push(fn);
    }
    async call(...args: any[]) {
      trace.push(["call", ...args]);
    }
    async enableOopifAutoAttach(...args: any[]) {
      trace.push(["oopif", ...args]);
    }
    async detachAttachedFrameTargets(id: number) {
      trace.push(["cleanup", id]);
    }
  }
  Object.assign(Base.prototype, rawEventMethods, {
    attachedTabIdForCdpEvent: lifecycleMethods.attachedTabIdForCdpEvent,
  });
  const o: any = original
    ? new (Original(Base))(api, "test", {}, () => {})
    : Object.assign(new Base(), { api });
  if (!original) registerCdpEventBridge(o);
  return { o, trace, handlers, attach, cleanup };
}
test("constructor bridge retains raw source, normalizes forwarded events and preserves filtering order", async () => {
  async function run(original: boolean) {
    const { o, trace, handlers, attach, cleanup } = create(original);
    const source = { sessionId: "s" };
    const e = { method: "Page.test", source, params: { x: 1 } };
    handlers.onCDPEvent(e);
    const raw = o.rawCdpEventsByTabId.get(1)[0];
    const identity = [
      raw.source === source,
      trace.find((v: any) => v?.[0] === "target")[1].source === source,
    ];
    o.internal = true;
    handlers.onCDPEvent(e);
    o.internal = false;
    o.protected = true;
    handlers.onCDPEvent(e);
    handlers.onCDPEvent({ ...e, source: { tabId: 99 } });
    handlers.onCDPDetach({ tabId: 9 });
    handlers.onCDPDetach({ sessionId: "s" });
    handlers.onCDPDetach({ tabId: 99 });
    await attach[0](1, { timeoutMs: 8 });
    await cleanup[0](1);
    return { trace, identity, raw: o.rawCdpEventsByTabId };
  }
  assert.deepEqual(await run(false), await run(true));
});
test("OOPIF setup rechecks attachment state and only marks successful configuration", async () => {
  const bindings = originalServiceBindings(["Cv", "$t"]);
  const original = new Function(
    ...Object.keys(bindings),
    "return {" + serviceClassMethod("qh", "enableOopifAutoAttach") + "}",
  )(...Object.values(bindings)).enableOopifAutoAttach;
  async function run(method: any, mode: string) {
    const trace: any[] = [];
    const o: any = {
      oopifAutoAttachTabIds: new Set(),
      async waitForTabAttachment(...args: any[]) {
        trace.push(["wait", ...args]);
        if (mode === "during") this.oopifAutoAttachTabIds.add(1);
      },
      async enableOopifAutoAttachForTarget(...args: any[]) {
        trace.push(["configure", ...args]);
        if (mode === "fail") throw Error("failed");
      },
    };
    if (mode === "already") o.oopifAutoAttachTabIds.add(1);
    let error;
    try {
      await method.call(o, "1", {
        deadlineMs: mode === "already" ? 0 : undefined,
      });
    } catch (e) {
      error = (e as Error).message;
    }
    return { trace, error, set: o.oopifAutoAttachTabIds };
  }
  for (const mode of ["normal", "during", "already", "fail"])
    assert.deepEqual(
      await run(enableOopifAutoAttach, mode),
      await run(original, mode),
    );
});
