import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import { AccessibilityTracking } from "../packages/browser/src/service/accessibility/tracking";
const original = originalServiceBindings(
  ["iu", "zre", "Lv", "$h", "Lr", "K2", "Ji", "nu", "Kh"],
  { Z2: {} },
);
function fixture(restored: boolean, scenario = "complete") {
  const trace: any[] = [],
    cdp: any = new EventEmitter();
  let store: any,
    dialog: any =
      scenario === "dialog"
        ? { id: "dialog", type: "prompt", message: "message" }
        : undefined;
  cdp.getJsDialog = () => dialog;
  cdp.activeJsDialog = () => dialog;
  cdp.addTabCleanupHandler = () => () => {};
  const navigate = () =>
    cdp.emit("event", {
      method: "Page.frameNavigated",
      source: { tabId: 1 },
      params: { frame: { id: "new", loaderId: "new-loader", url: "new-url" } },
    });
  cdp.call = async (tabId: number, method: string, params: any) => {
    trace.push([method, params]);
    if (method === "Page.getFrameTree") {
      if (scenario === "frame-race") navigate();
      if (scenario === "frame-error") throw Error("frame error");
      if (scenario === "dialog-race") {
        dialog = { id: "dialog", type: "alert", message: "message" };
        cdp.emit("event", {
          method: "Page.javascriptDialogOpening",
          source: { tabId },
          params: { type: "alert" },
        });
        throw Error("interrupted");
      }
      return {
        frameTree: { frame: { id: "main", loaderId: "loader", url: "url" } },
      };
    }
  };
  cdp.callTarget = async (
    target: any,
    method: string,
    params: any,
    options: any,
  ) => {
    trace.push([method, target, params, options]);
    if (scenario === "enable-error") throw Error("enable error");
  };
  cdp.readDocumentState = async () => {
    trace.push("read");
    if (scenario === "document-race") navigate();
    return {
      href: "document-url",
      painted: false,
      readyState: scenario === "loading" ? "interactive" : "complete",
    };
  };
  cdp.evaluateJavascript = async (_tabId: number, expression: string) => {
    trace.push(["evaluate", expression]);
    if (scenario === "probe-error") throw Error("probe error");
    return { readyState: "complete", elementCount: 200, textLength: 4000 };
  };
  const actions = {
    perform: async (_tab: number, action: any) => {
      trace.push(["action", action]);
      if (scenario === "action-error") throw Error("action error");
    },
  };
  store = restored
    ? new AccessibilityTracking(cdp, () => "session", actions)
    : new original.Kh(cdp, () => "session", actions);
  return { store, trace, cdp };
}
test("AX tracking preserves original initialization races, dialog interruptions and action ordering", async () => {
  async function run(restored: boolean, scenario: string) {
    const { store, trace, cdp } = fixture(restored, scenario);
    let error, identity;
    try {
      const first = await store.ensureTracked(1);
      identity = first === (await store.ensureTracked(1));
      await store.performAction(1, { kind: "type_text" });
    } catch (e: any) {
      error = e.message;
    }
    return {
      trace,
      error,
      identity,
      state: structuredClone(store.currentState(1)),
      listeners: cdp.listenerCount("event"),
    };
  }
  for (const scenario of [
    "complete",
    "loading",
    "dialog",
    "frame-race",
    "document-race",
    "dialog-race",
    "frame-error",
    "enable-error",
    "action-error",
  ])
    assert.deepEqual(
      await run(true, scenario),
      await run(false, scenario),
      scenario,
    );
});
test("AX navigation, paint and quiet polling preserve deadlines, updates and pending errors", async () => {
  const realNow = Date.now,
    realTimeout = globalThis.setTimeout;
  async function run(restored: boolean, method: string, scenario: string) {
    let clock = 0;
    const waits: number[] = [];
    const { store, trace } = fixture(restored);
    const state = store.currentState(1);
    Object.assign(state, {
      loading: method === "waitForNavigation" && scenario !== "idle",
      committed: method !== "waitForNavigation",
      painted: false,
    });
    if (scenario === "fast") state.painted = true;
    const previous = store.navigationState(state);
    Date.now = () => clock;
    globalThis.setTimeout = ((callback: any, ms: number) => {
      waits.push(ms);
      clock += ms;
      if (scenario === "settle" && clock >= 40) {
        state.committed = true;
        state.painted = true;
      }
      if (scenario === "update") state.lastAXUpdateMilliseconds = clock;
      if (scenario === "error" && clock >= 20)
        state.pendingError = Error("pending");
      queueMicrotask(callback);
      return 0;
    }) as any;
    store.performanceSpan = {
      withSpan: async (name: string, attrs: any, run: any) => {
        trace.push([name, attrs]);
        return await run();
      },
    };
    let result, error;
    try {
      result = await store[method](state, previous, scenario === "navigate");
    } catch (e: any) {
      error = e.message;
    }
    return { result, error, waits, clock, trace };
  }
  try {
    for (const method of [
      "waitForNavigation",
      "waitForFirstPaint",
      "waitForAXQuiet",
    ])
      for (const scenario of [
        "idle",
        "settle",
        "fast",
        "timeout",
        "update",
        "error",
        "navigate",
      ])
        assert.deepEqual(
          await run(true, method, scenario),
          await run(false, method, scenario),
          `${method}:${scenario}`,
        );
  } finally {
    Date.now = realNow;
    globalThis.setTimeout = realTimeout;
  }
});
test("AX document probing retains dialog fast path and swallows evaluation failure", async () => {
  async function run(restored: boolean, scenario: string) {
    const { store, trace } = fixture(restored, scenario);
    return {
      result: await store.probeNavigationState(store.currentState(1)),
      trace,
    };
  }
  for (const scenario of ["complete", "dialog", "probe-error"])
    assert.deepEqual(await run(true, scenario), await run(false, scenario));
});
