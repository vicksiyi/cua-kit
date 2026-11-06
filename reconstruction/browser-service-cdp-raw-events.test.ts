import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  serviceClassMethod,
  serviceClassWithMethods,
  serviceSourceSha256,
  originalServiceBindings,
} from "./service-source.ts";
import { rawEventMethods } from "../packages/browser/src/service/cdp/raw_event_methods";
// These helper names were re-inspected in this exact installed artifact. A
// changed artifact must be audited before executing unrelated minified bindings.
assert.equal(serviceSourceSha256, "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
  "Re-audit raw event helper bindings for changed browser-service artifact");
const sourceClass = serviceClassWithMethods(Object.keys(rawEventMethods));
const bindings = originalServiceBindings(["JN", "Ate", "kte", "Rte"]);
const original = new Function(
  ...Object.keys(bindings),
  "return {" +
    Object.keys(rawEventMethods)
      .map((n) => serviceClassMethod(sourceClass, n))
      .join(",") +
    "}",
)(...Object.values(bindings));
function owner(methods: any) {
  const o: any = Object.assign(new EventEmitter(), methods, {
    rawCdpEventsByTabId: new Map(),
    rawCdpEventEvictedThroughSequenceByTabId: new Map(),
    rawCdpEventSequenceByTabId: new Map(),
    frameSessionsBySessionId: new Map(),
  });
  o.waitForTabAttachment = async () => {};
  return o;
}
function record(
  o: any,
  method = "Page.event",
  params: any = {},
  source: any = { tabId: 1 },
) {
  o.recordRawCdpEvent(1, { method, params, source });
}
test("raw event buffer preserves shallow copying, source identity, tracked target and projection", () => {
  function run(methods: any) {
    const o = owner(methods),
      nested = { x: 1 },
      params = { nested, old: 1 },
      source = { sessionId: "s" };
    o.frameSessionsBySessionId.set("s", { targetId: "old-target" });
    record(o, "Network.event", params, source);
    params.old = 2;
    nested.x = 2;
    o.frameSessionsBySessionId.get("s").targetId = "new-target";
    const old = o.rawCdpEventsResult(1, 0, {
      target: { targetId: "old-target" },
    });
    const fresh = o.rawCdpEventsResult(1, 0, {
      target: { targetId: "new-target" },
    });
    const both = o.rawCdpEventsResult(1, 0, {
      target: { sessionId: "s", targetId: "new-target" },
    });
    return {
      old,
      fresh,
      both,
      references: [
        old.events[0].source === source,
        old.events[0].params === params,
        old.events[0].params.nested === nested,
      ],
      keys: Object.keys(old.events[0]),
    };
  }
  assert.deepEqual(run(rawEventMethods), run(original));
});
test("raw event pagination, retention and discard preserve cursors and eviction watermark", () => {
  function run(methods: any) {
    const o = owner(methods);
    for (let i = 0; i < 1003; i++) record(o, i % 2 ? "odd" : "even", { i });
    const results = [
      o.rawCdpEventsResult(1, 0, { limit: 2 }),
      o.rawCdpEventsResult(1, 3, { methods: ["odd"], limit: 2 }),
      o.rawCdpEventsResult(1, 0, { limit: 0 }),
      o.rawCdpEventsResult(1, 1002, { methods: [] }),
    ];
    o.discardRawCdpEventsForTab(1);
    results.push(
      o.rawCdpEventsResult(1, 1002, {}),
      o.rawCdpEventsResult(1, 1003, {}),
    );
    record(o);
    results.push(o.rawCdpEventsResult(1, 1003, {}));
    return { results, size: o.rawCdpEventsByTabId.get(1).length };
  }
  assert.deepEqual(run(rawEventMethods), run(original));
});
test("raw event read snapshots cursor before attach only when timeout is supplied", async () => {
  async function run(methods: any) {
    const results = [];
    for (const options of [{}, { timeoutMs: 0 }, { afterSequence: 0 }]) {
      const o = owner(methods);
      record(o);
      o.waitForTabAttachment = async () => {
        record(o, "during-attach");
      };
      results.push(await o.readRawCdpEvents("1", options));
    }
    return results;
  }
  assert.deepEqual(await run(rawEventMethods), await run(original));
});
test("raw event long poll settles on matching data, eviction, detach or timeout and removes listeners", async () => {
  async function run(methods: any, mode: string) {
    const o = owner(methods);
    const pending = o.readRawCdpEvents(1, {
      timeoutMs: mode === "timeout" ? 1 : 100,
      methods: ["wanted"],
    });
    await Promise.resolve();
    await Promise.resolve();
    record(o, "ignored");
    o.emit("event", {});
    o.emit("tabDetached", 2);
    if (mode === "event") {
      record(o, "wanted");
      o.emit("event", {});
    }
    if (mode === "discard") {
      o.discardRawCdpEventsForTab(1);
      o.emit("event", {});
    }
    if (mode === "detach") o.emit("tabDetached", 1);
    const result = await pending;
    return {
      result,
      listeners: [o.listenerCount("event"), o.listenerCount("tabDetached")],
    };
  }
  for (const mode of ["event", "discard", "detach", "timeout"])
    assert.deepEqual(
      await run(rawEventMethods, mode),
      await run(original, mode),
    );
});

test("raw event oracle provenance", (t) => { t.diagnostic(`Installed browser-service ${serviceSourceSha256}; class ${sourceClass}; helpers JN/Ate/kte/Rte`); });
