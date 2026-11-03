import test from "node:test";
import assert from "node:assert/strict";
import {
  serviceClassMethod,
  originalServiceBindings,
} from "./service-source.ts";
import { frameMethods } from "../packages/browser/dist/service/cdp/frame_methods.js";
import { lifecycleMethods } from "../packages/browser/dist/service/cdp/lifecycle_methods.js";
const bindings = originalServiceBindings([
  "Uh",
  "HN",
  "Io",
  "jh",
  "GN",
  "VN",
  "Cv",
  "$t",
  "Av",
  "tu",
  "jN",
  "Pv",
]);
const original = new Function(
  ...Object.keys(bindings),
  "return {" +
    Object.keys(frameMethods)
      .concat(Object.keys(lifecycleMethods))
      .map((n) => serviceClassMethod("qh", n))
      .join(",") +
    "}",
)(...Object.values(bindings));
const reconstructed = { ...lifecycleMethods, ...frameMethods };
function owner(methods: any) {
  const o: any = {
    ...methods,
    trace: [],
    initializedFrameSessions: new WeakSet(),
    frameSessionInitializationPromises: new WeakMap(),
  };
  for (const key of [
    "mainFrameIdsByTabId",
    "topLevelUrlsByTabId",
    "topLevelSecurityOriginsByTabId",
    "frameSessionsBySessionId",
    "frameSessionsByTabId",
    "jsDialogsByTabId",
  ])
    o[key] = new Map();
  o.discardRawCdpEventsForTab = (id: number) =>
    o.trace.push([
      "discard",
      id,
      o.mainFrameIdsByTabId.get(id),
      o.topLevelUrlsByTabId.get(id),
      o.topLevelSecurityOriginsByTabId.get(id),
    ]);
  o.api = {
    async executeCdp(payload: any) {
      o.trace.push(payload);
      return { frameTree: { frame: { id: "initialized" } } };
    },
  };
  return o;
}
function attach(o: any, sessionId = "s", targetId = "t") {
  o.handleTargetEvent({
    method: "Target.attachedToTarget",
    source: { tabId: 1 },
    params: { sessionId, targetInfo: { type: "iframe", targetId } },
  });
  return o.frameSessionsBySessionId.get(sessionId);
}
function snapshot(o: any) {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v instanceof Map || Array.isArray(v)),
  );
}
test("frame events preserve root navigation scope and origin invalidation order", () => {
  function run(methods: any) {
    const o = owner(methods);
    for (const [source, frame] of [
      [{ tabId: 1 }, { id: "main", url: "a", securityOrigin: "a" }],
      [{ tabId: 1 }, { id: "main", url: "a/2", securityOrigin: "a" }],
      [
        { tabId: 1, sessionId: "child" },
        { id: "child", url: "b", securityOrigin: "b" },
      ],
      [
        { tabId: 1, targetId: "child" },
        { id: "child", url: "b", securityOrigin: "b" },
      ],
      [
        { tabId: 1 },
        { id: "child", parentId: "main", url: "b", securityOrigin: "b" },
      ],
      [{ tabId: 1 }, { id: "main", url: "c", securityOrigin: "c" }],
    ])
      o.handleTargetEvent({
        method: "Page.frameNavigated",
        source,
        params: { frame },
      });
    // Original VN ignores targetId but rejects sessionId.
    o.handleTargetEvent({
      method: "Page.navigatedWithinDocument",
      source: { tabId: 1, targetId: "other" },
      params: { frameId: "main", url: "c#hash" },
    });
    o.handleTargetEvent({
      method: "Page.navigatedWithinDocument",
      source: { tabId: 1, sessionId: "other" },
      params: { frameId: "main", url: "wrong" },
    });
    return snapshot(o);
  }
  assert.deepEqual(run(reconstructed), run(original));
});
test("frame event sessions retain existing identity and reject a second navigation frame id", () => {
  function run(methods: any) {
    const o = owner(methods),
      s = attach(o);
    for (const id of ["f", "different", "f"])
      o.handleTargetEvent({
        method: "Page.frameNavigated",
        source: { tabId: 1, sessionId: "s" },
        params: { frame: { id } },
      });
    attach(o, "s", "new");
    const before = {
      frameId: s.frameId,
      keys: [...o.frameSessionsByTabId.get(1).keys()],
      same: o.frameSessionsBySessionId.get("s") === s,
    };
    o.handleTargetEvent({
      method: "Page.frameDetached",
      source: { tabId: 1 },
      params: { frameId: "f" },
    });
    attach(o, "s2", "t2");
    o.handleTargetEvent({
      method: "Target.detachedFromTarget",
      source: {},
      params: { sessionId: "s2" },
    });
    return { before, state: snapshot(o) };
  }
  assert.deepEqual(run(reconstructed), run(original));
});
test("frame initialization shares work and checks session identity before updating indices", async () => {
  async function run(methods: any, stale: boolean) {
    const o = owner(methods),
      s = attach(o);
    const execute = o.api.executeCdp;
    o.api.executeCdp = async (payload: any) => {
      const result = await execute(payload);
      if (stale && payload.method === "Page.getFrameTree")
        o.frameSessionsBySessionId.delete("s");
      return result;
    };
    const options = {
      timeoutMs: 44,
      preserveDebuggerOnTimeout: true,
      beforeDispatch: () => o.trace.push("before"),
    };
    await Promise.all([
      o.initializeAttachedFrameSession(s, options),
      o.initializeAttachedFrameSession(s, options),
    ]);
    await o.initializeAttachedFrameSession(s, options);
    return {
      initialized: o.initializedFrameSessions.has(s),
      pending: o.frameSessionInitializationPromises.has(s),
      frameId: s.frameId,
      state: snapshot(o),
    };
  }
  for (const stale of [false, true])
    assert.deepEqual(
      await run(reconstructed, stale),
      await run(original, stale),
    );
});
test("frame initialization waiter retries rejected shared work; try preserves deadline failures", async () => {
  async function run(methods: any) {
    const o = owner(methods),
      s = attach(o);
    let calls = 0;
    const execute = o.api.executeCdp;
    o.api.executeCdp = async (payload: any) => {
      if (++calls === 1) throw Error("first failed");
      return execute(payload);
    };
    const results = await Promise.allSettled([
      o.initializeAttachedFrameSession(s),
      o.initializeAttachedFrameSession(s),
    ]);
    const other = attach(o, "other", "otherTarget");
    await o.tryInitializeAttachedFrameSession(other, {});
    let error;
    try {
      await o.tryInitializeAttachedFrameSession(other, { deadlineMs: 0 });
    } catch (e) {
      error = (e as Error).message;
    }
    return {
      statuses: results.map((r) => r.status),
      calls,
      error,
      state: snapshot(o),
    };
  }
  assert.deepEqual(await run(reconstructed), await run(original));
});
