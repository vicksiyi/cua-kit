import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import { DocumentResponses } from "../packages/browser/dist/service/context/document_responses.js";
import { CdpEventEmitter } from "../packages/browser/dist/service/cdp/event_emitter.js";
const Original = originalServiceBindings(["Za", "Mc", "su", "Yre", "Xh"]).Xh;
function fixture(Class: any) {
  const calls: any[] = [], cdp = new CdpEventEmitter() as any;
  cdp.call = async (...args: any[]) => { calls.push(structuredClone(args)); };
  cdp.isTabAttached = () => true;
  cdp.addTabAttachHandler = (handler: any) => { cdp.attach = handler; };
  return { instance: new Class(cdp), cdp, calls };
}
function event(overrides = {}, source = {}) {
  return { method: "Fetch.requestPaused", source: { tabId: 1, ...source }, params: { requestId: "r", resourceType: "Document", responseStatusCode: 200, responseStatusText: "OK", responseHeaders: [{ name: "a", value: "b" }], ...overrides } };
}
test("document responses preserve ownership, header identity, interception and target filtering", async () => {
  async function run(Class: any) {
    const { instance: o, cdp, calls } = fixture(Class), states: any[] = [];
    await cdp.attach(1, { attach: true });
    const first = o.ensureInterceptionReady(1);
    states.push(first === o.ensureInterceptionReady(1));
    for (const mode of ["same", "mutate", "replace", "own", "error", "session", "other"]) {
      o.listeners = {};
      o.on("intercept", (_: any, __: any, claim: any) => { if (mode === "own") claim(); });
      o.on("response", (_: any, response: any) => {
        if (mode === "mutate") response.responseHeaders.push({ name: "x", value: "y" });
        if (mode === "replace") response.responseHeaders = [];
      });
      await o.handleEvent(event(mode === "error" ? { responseErrorReason: "failed" } : mode === "other" ? { resourceType: "Image" } : {}, mode === "session" ? { sessionId: "s" } : {}));
      states.push([mode, o.hasOwnedPausedResponses(1)]);
      if (mode === "own") await o.failResponse(1, "r");
    }
    cdp.emit("tabDetached", 1);
    return { calls, states, fields: Object.keys(o), sizes: [o.setupByTab.size, o.ownedResponsesByTab.size] };
  }
  assert.deepEqual(await run(DocumentResponses), await run(Original));
});
test("request interceptors preserve priority, exception blocking, resolution and drain ordering", async () => {
  async function run(Class: any) {
    const { instance: o, calls } = fixture(Class), trace: any[] = [];
    o.on("requestResolution", (_: any, __: any, outcome: any) => trace.push(outcome));
    const removeLow = await o.addRequestInterceptor(1, () => { trace.push("low"); }, 0);
    let mode = "pass";
    const removeHigh = await o.addRequestInterceptor(1, () => {
      trace.push("high");
      if (mode === "throw") throw Error("failure");
      return mode;
    }, 10);
    for (mode of ["pass", "handled", "block", "throw"]) await o.handleRequest(1, { requestId: mode });
    await removeHigh(); await removeHigh(); await removeLow();
    const gate = Promise.withResolvers<void>();
    const remove = await o.addRequestInterceptor(1, () => gate.promise, 0, { drainOnRemove: true });
    const request = o.handleRequest(1, { requestId: "drain" });
    let removed = false;
    const removing = remove().then(() => { removed = true; });
    await Promise.resolve(); trace.push(["beforeDrain", removed, o.hasRequestInterceptors(1)]);
    gate.resolve(); await request; await removing;
    trace.push(["afterDrain", removed]);
    return { calls, trace, enabled: [...o.configuredRequestsByTab] };
  }
  assert.deepEqual(await run(DocumentResponses), await run(Original));
});
test("response failures retain ownership; setup and configuration failures can retry", async () => {
  async function run(Class: any) {
    const { instance: o, cdp, calls } = fixture(Class), states: any[] = [];
    const normal = cdp.call;
    cdp.call = async () => { throw Error("failed"); };
    await assert.rejects(o.ensureInterceptionReady(1));
    states.push(o.setupByTab.size);
    cdp.call = normal; await o.ensureInterceptionReady(1);
    cdp.call = async () => { throw Error("failed"); };
    await assert.rejects(o.addRequestInterceptor(1, () => "pass"));
    states.push(o.hasRequestInterceptors(1));
    await assert.rejects(o.handleEvent(event()));
    states.push(o.hasOwnedPausedResponses(1));
    cdp.call = normal;
    const remove = await o.addRequestInterceptor(1, () => "pass"); await remove();
    await o.continueResponse(1, "r"); states.push(o.hasOwnedPausedResponses(1));
    return { calls, states };
  }
  assert.deepEqual(await run(DocumentResponses), await run(Original));
});
