import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import { AccessibilityStateStore } from "../packages/browser/src/service/accessibility/state_store";
const original = originalServiceBindings(
  ["iu", "zre", "Lv", "$h", "Lr", "K2", "Kh"],
  { Z2: {} },
);
function fixture(restored: boolean) {
  const cdp: any = new EventEmitter();
  let cleanupCount = 0,
    sessionId = "session";
  cdp.getJsDialog = () => undefined;
  cdp.addTabCleanupHandler = (handler: any) => {
    cdp.cleanup = handler;
    return () => {
      cleanupCount++;
    };
  };
  const store: any = restored
    ? new AccessibilityStateStore(cdp, () => sessionId)
    : new original.Kh(cdp, () => sessionId, {});
  return {
    store,
    cdp,
    setSession: (id: string) => {
      sessionId = id;
    },
    cleanupCount: () => cleanupCount,
  };
}
const failure = (run: () => unknown) => {
  try {
    return run();
  } catch (error: any) {
    return { error: error.message };
  }
};

test("AX state events match original across navigation rollback, paints, frames, sessions and cleanup", () => {
  function run(restored: boolean) {
    const f = fixture(restored),
      { store, cdp } = f,
      trace: any[] = [];
    const event = (
      method: string,
      params: any = {},
      source: any = { tabId: 1 },
    ) => {
      cdp.emit("event", { method, params, source });
      trace.push(structuredClone(store.sessions));
    };
    event("Page.loadEventFired");
    event("Page.frameNavigated", {
      frame: { id: "main", loaderId: "old", url: "https://example.com" },
    });
    const state = store.currentState(1);
    state.enabledTargets.add("1:root");
    state.enabledTargets.add("1:remote");
    state.frames.set("main", { frameId: "main", target: { tabId: 1 } });
    state.frames.set("child", {
      frameId: "child",
      parentFrameId: "main",
      target: { tabId: 1, sessionId: "remote" },
    });
    state.frames.set("nested", {
      frameId: "nested",
      parentFrameId: "child",
      target: { tabId: 1, sessionId: "remote" },
    });
    state.targets.set("child-node", { frameId: "child" });
    state.targets.set("nested-node", { frameId: "nested" });
    event("Accessibility.nodesUpdated");
    event("Accessibility.loadComplete", {}, { tabId: 1, sessionId: "unknown" });
    event("Page.lifecycleEvent", {
      frameId: "main",
      loaderId: "wrong",
      name: "firstPaint",
    });
    event("Page.lifecycleEvent", {
      frameId: "main",
      loaderId: "old",
      name: "firstContentfulPaint",
    });
    event("Page.loadEventFired");
    event("Page.frameStartedLoading", { frameId: "main" });
    event("Page.navigatedWithinDocument", {
      frameId: "main",
      url: "https://example.com/#hash",
      navigationType: "fragment",
    });
    event("Page.frameStartedLoading", { frameId: "main" });
    event("Page.navigatedWithinDocument", {
      frameId: "main",
      url: "https://example.com/path",
      navigationType: "historyApi",
    });
    event("Page.javascriptDialogOpening");
    event("Page.javascriptDialogClosed");
    event("Target.detachedFromTarget", { sessionId: "remote" });
    event("Page.frameStartedLoading", { frameId: "main" });
    event("Page.frameStartedLoading", { frameId: "main" });
    event("Page.frameNavigated", {
      frame: { id: "main", loaderId: "new", url: "https://example.com/new" },
      type: "BackForwardCacheRestore",
    });
    event("Page.domContentEventFired");
    event("Page.frameStoppedLoading", { frameId: "main" });
    event("Page.frameDetached", { frameId: "main" });
    f.setSession("other");
    store.currentState(1);
    store.currentState(2);
    cdp.cleanup(1);
    trace.push(structuredClone(store.sessions));
    store.startObserving();
    trace.push([cdp.listenerCount("event"), cdp.listenerCount("tabDetached")]);
    store.dispose();
    store.dispose();
    trace.push([
      f.cleanupCount(),
      store.sessions.size,
      cdp.listenerCount("event"),
    ]);
    return trace;
  }
  const now = Date.now;
  Date.now = () => 1234;
  try {
    assert.deepEqual(run(true), run(false));
  } finally {
    Date.now = now;
  }
});

test("AX capture commit and stale validation preserve original mutation order and omitted fields", () => {
  function run(restored: boolean, scenario: string) {
    const f = fixture(restored),
      { store } = f,
      state = store.currentState(1);
    state.mainFrameId = "main";
    state.loaderId = "loader";
    state.pendingNavigationState = { loading: true };
    const revision = {
      text: "tree",
      identityForElement: (id: number) => (id === 1 ? "identity" : undefined),
      isValueSettableForElement: () => true,
    };
    const candidate = {
      documentKey: "main:loader",
      frames: new Map([["main", { frameId: "main", target: { tabId: 1 } }]]),
      targets: new Map([
        [
          "identity",
          { frameId: "main", target: { tabId: 1 }, backendNodeId: 2 },
        ],
      ]),
      accessibilityRevision: revision,
      tab: { id: 1, title: "Title", url: "https://example.com" },
      url: "https://example.com",
      rendered: "tree",
    };
    store.getSiteInstruction = () => {
      if (scenario === "instruction-throws") throw Error("instruction failure");
      return "instruction";
    };
    const capture: any = {
      documentKey: "main:loader",
      candidate,
      data: "image",
    };
    if (scenario === "screenshot") {
      delete capture.candidate;
      capture.screenshotUnavailable = "unavailable";
    }
    if (scenario === "document-changed") capture.documentKey = "other";
    if (scenario === "candidate-changed") candidate.documentKey = "other";
    if (scenario === "session-changed") f.setSession("other");
    if (scenario === "pending-error") state.pendingError = Error("pending");
    const result: any = failure(() => store.commitCapture(state, capture));
    const target = failure(() => store.targetForElement(1, 1));
    const valid =
      result && !result.error
        ? failure(() => store.validateCapture(1, result))
        : undefined;
    state.loaderId = "new-loader";
    const stale =
      result && !result.error
        ? failure(() => store.validateCapture(1, result))
        : undefined;
    const oldTarget = failure(() => store.targetForElement(1, 1));
    return {
      result,
      target,
      valid,
      stale,
      oldTarget,
      documentKey: state.documentKey,
      frames: [...state.frames],
      targets: [...state.targets],
      pending: state.pendingNavigationState,
      revisionSame: state.accessibilityRevision === revision,
      unknownCapture: failure(() => store.validateCapture(1, {})),
    };
  }
  for (const scenario of [
    "normal",
    "screenshot",
    "document-changed",
    "candidate-changed",
    "session-changed",
    "pending-error",
    "instruction-throws",
  ])
    assert.deepEqual(run(true, scenario), run(false, scenario), scenario);
});

test("AX deferred errors preserve first rejection and are consumed once", async () => {
  async function run(restored: boolean) {
    const { store, cdp } = fixture(restored);
    store.trackDeferredPageLoad(1, Promise.reject(Error("first")));
    store.trackDeferredPageLoad(1, Promise.reject(Error("second")));
    await Promise.resolve();
    const first = failure(() => store.throwPendingError(1)),
      second = failure(() => store.throwPendingError(1));
    const state = store.currentState(1);
    state.mainFrameId = "main";
    state.loaderId = "loader";
    state.documentKey = "main:loader";
    state.accessibilityRevision = { identityForElement: () => "dialog" };
    state.targets.set("dialog", {
      target: { tabId: 1 },
      frameId: "main",
      backendNodeId: 0,
      javaScriptDialog: { dialogID: "dialog", control: "accept" },
    });
    const stale = failure(() => store.targetForElement(1, 1));
    cdp.getJsDialog = () => ({ id: "dialog", type: "alert" });
    const target = store.targetForElement(1, 1);
    state.pendingError = Error("completion");
    const completed = failure(() =>
      store.markActionCompleted(1, { revision: 3 }),
    );
    return {
      first,
      second,
      stale,
      target,
      completed,
      pending: state.pendingNavigationState,
    };
  }
  assert.deepEqual(await run(true), await run(false));
});
