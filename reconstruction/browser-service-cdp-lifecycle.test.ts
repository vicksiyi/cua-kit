import test from "node:test";
import assert from "node:assert/strict";
import { serviceClassMethod } from "./service-source.ts";
import { lifecycleMethods } from "../packages/browser/dist/service/cdp/lifecycle_methods.js";
const original = new Function(
  "return {" +
    Object.keys(lifecycleMethods)
      .map((name) => serviceClassMethod("qh", name))
      .join(",") +
    "}",
)();
function owner(methods: any) {
  const trace: any[] = [];
  const state: any = { ...methods, trace };
  for (const key of [
    "attachedTabIds",
    "initializingTabIds",
    "turnEndDetachTabIds",
    "oopifAutoAttachTabIds",
    "rawScreencastTabIds",
    "configuredWorkerStartProtection",
  ])
    state[key] = new Set();
  for (const key of [
    "tabAttachmentPromises",
    "frameSessionsBySessionId",
    "frameSessionsByTabId",
    "jsDialogsByTabId",
    "workerStartProtectionByTab",
    "browserAuthWorkerBypassByTab",
    "workerStartConfigurationByTab",
    "retiredInternalScreencastSessionsByTabId",
    "mainFrameIdsByTabId",
    "topLevelSecurityOriginsByTabId",
    "topLevelUrlsByTabId",
    "attachedFrameTargetIdsByTabId",
  ])
    state[key] = new Map();
  state.api = {
    async detach(id: number) {
      trace.push(["detach", id, state.turnEndDetachTabIds.has(id)]);
    },
    async detachTarget(id: number, target: string) {
      trace.push([
        "detachTarget",
        id,
        target,
        state.attachedFrameTargetIdsByTabId.has(id),
      ]);
      if (target === "bad") throw Error("failed");
    },
  };
  state.runTabCleanupHandlers = async (id: number) => {
    trace.push(["cleanup", id]);
  };
  state.deleteFileChoosersForTab = (id: number) => {
    trace.push(["file", id]);
  };
  state.discardRawCdpEventsForTab = (id: number) => {
    trace.push(["discard", id]);
  };
  state.emit = (...args: any[]) => {
    trace.push(args);
  };
  return state;
}
function snapshot(state: any) {
  return Object.fromEntries(
    Object.entries(state).filter(
      ([, v]) => v instanceof Map || v instanceof Set || Array.isArray(v),
    ),
  );
}
test("CDP lifecycle preserves source precedence, frame aliases and dialog cleanup", () => {
  function run(methods: any) {
    const o = owner(methods);
    const session = {
      frameId: null,
      sessionId: "s",
      target: { tabId: 7, sessionId: "s" },
      targetId: "t",
    };
    o.frameSessionsBySessionId.set("s", session);
    o.setFrameSessionTargetId(7, "t", session);
    o.setFrameSessionForFrame(7, "t", session);
    o.setFrameSessionForFrame(7, "f", session);
    const first = [...o.frameSessionsByTabId.get(7).keys()];
    o.setFrameSessionTargetId(7, "f", session);
    o.setFrameSessionTargetId(7, "new", session);
    const routing = [
      o.attachedTabIdForCdpEvent({ tabId: 7, sessionId: "s" }),
      o.attachedTabIdForCdpEvent({ sessionId: "s" }),
      o.attachedTabIdForCdpEvent({ sessionId: "missing", targetId: "new" }),
      o.attachedTabIdForCdpEvent({ targetId: "new" }),
    ];
    o.jsDialogsByTabId.set(7, { target: session.target });
    o.deleteFrameSession(session);
    return { first, routing, state: snapshot(o) };
  }
  assert.deepEqual(run(lifecycleMethods), run(original));
  assert.deepEqual(run(lifecycleMethods).routing, [undefined, 7, undefined, 7]);
});
test("CDP forget during initialization defers cleanup; force and detach reasons match source", async () => {
  async function run(methods: any) {
    const o = owner(methods);
    for (const [key, value] of Object.entries(o)) {
      if (value instanceof Set) value.add(7);
      if (
        value instanceof Map &&
        ![
          "frameSessionsByTabId",
          "frameSessionsBySessionId",
          "tabAttachmentPromises",
        ].includes(key)
      )
        value.set(7, "sentinel");
    }
    o.attachedTabIds.add(7);
    o.initializingTabIds.add(7);
    const promise = Promise.resolve();
    o.tabAttachmentPromises.set(7, promise);
    o.forgetAttachedTab(7, true);
    const deferred = [
      o.attachedTabIds.has(7),
      o.tabAttachmentPromises.has(7),
      o.trace.length,
    ];
    o.initializingTabIds.delete(7);
    o.forgetAttachedTab(7, true);
    o.forgetAttachedTab(7);
    o.attachedTabIds.add(8);
    await o.detachTab("8", "turnEnded");
    o.attachedTabIds.add(9);
    o.api.detach = async () => {
      throw Error("provider failed");
    };
    let error;
    try {
      await o.detachTab(9, "turnEnded");
    } catch (e) {
      error = (e as Error).message;
    }
    return { deferred, error, state: snapshot(o) };
  }
  assert.deepEqual(await run(lifecycleMethods), await run(original));
});
test("CDP detach awaits in-flight attachment and child target cleanup settles failures", async () => {
  async function run(methods: any) {
    const o = owner(methods);
    o.tabAttachmentPromises.set(
      2,
      Promise.resolve().then(() => {
        o.attachedTabIds.add(2);
      }),
    );
    await o.detachTab(2);
    o.tabAttachmentPromises.set(
      3,
      Promise.resolve().then(() => {
        o.tabAttachmentPromises.delete(3);
        throw Error("attach failed");
      }),
    );
    await o.detachTab(3);
    o.rememberAttachedFrameTarget(4, "good");
    o.rememberAttachedFrameTarget(4, "bad");
    o.rememberAttachedFrameTarget(4, "good");
    await o.detachAttachedFrameTargets(4);
    await o.detachAttachedFrameTargets(4);
    o.rememberAttachedFrameTarget(5, "no-provider");
    delete o.api.detachTarget;
    await o.detachAttachedFrameTargets(5);
    let error;
    try {
      await o.detachTab("invalid");
    } catch (e) {
      error = (e as Error).message;
    }
    return { error, state: snapshot(o) };
  }
  assert.deepEqual(await run(lifecycleMethods), await run(original));
});
