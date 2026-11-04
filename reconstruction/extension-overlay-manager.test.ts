import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createOverlayManagerClass,
  createCursorMessageHandler,
} from "../packages/browser-extension/src/overlay_manager";
import { createObservedTabsClass } from "../packages/browser-extension/src/observed_tabs";

function snapshot(manager: any) {
  return {
    sessions: Array.from(manager.sessions, ([id, state]: any) => [
      id,
      {
        ...state,
        tabIds: [...state.tabIds],
        cursorByTabId: [...state.cursorByTabId],
        abortController: state.abortController
          ? { aborted: state.abortController.signal.aborted }
          : null,
      },
    ]),
    tabSessions: Array.from(manager.tabSessions, ([id, sessions]: any) => [
      id,
      [...sessions],
    ]),
    active: manager.isBrowserControlActive(),
    lastActive: manager.lastBrowserControlActive,
    overlays: [1, 2, 3, 4, 5, 6].map((id) =>
      manager.readCursorOverlayState(id),
    ),
  };
}
async function exercise(original: boolean) {
  const trace: any[] = [],
    observed = new Set([1, 2]);
  const chrome: any = {
    tabs: {
      async sendMessage(id: number, message: any) {
        trace.push(["send", id, structuredClone(message)]);
        if (id === 4) throw new Error("closed tab");
        return { ok: id === 5 ? 1 : true };
      },
    },
  };
  const contentRuntime = {
    async ensureContentScript(id: number) {
      trace.push(["ensure", id]);
      return id !== 6;
    },
    async ping(id: number) {
      trace.push(["ping", id]);
      return id !== 6;
    },
    async withTimeout(operation: Promise<any>) {
      trace.push(["timeout"]);
      return operation;
    },
  };
  const Manager = original
    ? extensionBindings(["Hu", "nS", "iS", "sS", "aS"], {
        chrome,
        Mu: contentRuntime.ensureContentScript,
        Ta: contentRuntime.ping,
        de: contentRuntime.withTimeout,
      }).aS
    : createOverlayManagerClass({
        chrome,
        contentRuntime,
        setTimeout,
        clearTimeout,
      });
  const manager = new Manager({
    observedTabs: { isObserved: (id: number) => observed.has(id) },
    onBrowserControlActivityChanged: (active: boolean) =>
      trace.push(["activity", active]),
  });
  const states: any[] = [],
    results: any[] = [];
  async function call(method: string, ...args: any[]) {
    const value = await manager[method](...args);
    results.push([
      method,
      value instanceof AbortSignal ? { aborted: value.aborted } : value,
    ]);
    states.push(snapshot(manager));
    return value;
  }
  await call("finishSession", "missing");
  try {
    await call("startRequest", "missing", 1);
  } catch (error: any) {
    results.push([error.name, error.message]);
  }
  await call("startSession", "a", "t1", { publishTabs: false });
  await call("trackTab", "a", 1);
  const signal = await call("startRequest", "a", 1);
  await call("startRequest", "a", 2);
  await call("setCursorState", "a", 1, "t1", {
    x: 10,
    y: 20,
    visible: true,
    moveSequence: 1,
  });
  observed.delete(1);
  await call("republishTabStates", [1, 2]);
  await call("startSession", "b", "t2");
  await call("trackTab", "b", 1);
  await call(
    "setCursorState",
    "b",
    1,
    "t2",
    { x: 80, y: 90, visible: true },
    { publish: false },
  );
  await call("stopSession", "a");
  results.push(["signalAfterStop", signal.aborted]);
  await call("finishRequest", "a");
  await call("finishRequest", "a");
  await call("finishRequest", "a");
  await call("setCursorState", "a", 1, "ignored", {
    x: 0,
    y: 0,
    visible: true,
  });
  await call("startSession", "a", "t3");
  await call(
    "setCursorState",
    "a",
    2,
    "t3",
    { x: 30, y: 40, visible: true },
    { publish: false },
  );
  await call("startSession", "a", null, { publishTabs: false });
  for (const id of [4, 5, 6]) {
    await call("trackTab", "a", id, { publish: false });
    await call("setCursorState", "a", id, "t3", {
      x: id,
      y: id,
      visible: true,
    });
  }
  manager.setBrowserControlActivityChangeHandler((active: boolean) =>
    trace.push(["new-activity", active]),
  );
  await call("finishSession", "a");
  await call("untrackTab", "b", 1);
  await call("republishTabState", 3);
  await call("startSession", "c");
  await call("startSession", "d");
  await call("stopActiveSessions");
  await call("finishSession", "c");
  await call("finishSession", "d");
  return {
    states,
    results,
    trace,
    methods: Object.getOwnPropertyNames(Manager.prototype),
  };
}
test("overlay manager matches original session priority, cancellation, publication and method inventory", async () => {
  const actual = await exercise(false);
  assert.deepEqual(actual, await exercise(true));
  assert.ok(
    actual.results.some(
      (value) => value[0] === "signalAfterStop" && value[1] === true,
    ),
  );
  assert.equal(actual.states.at(-1).active, false);
  assert.ok(actual.states.some((state) => state.overlays[0].sessionId === "b"));
  assert.ok(
    actual.states.some(
      (state) =>
        state.overlays[0].cursor?.visible === false &&
        !("moveSequence" in state.overlays[0].cursor),
    ),
  );
});

test("cursor runtime message handler preserves original sender and sequence validation", () => {
  const run = (original: boolean) => {
    const trace: any[] = [],
      overlay = {
        readCursorOverlayState(id: number): any {
          trace.push(["read", id]);
          return { tabId: id };
        },
      },
      handler = {
        notifyCursorArrived(value: any) {
          trace.push(["arrived", value]);
        },
      };
    const listener = original
      ? (message: any, sender: any, reply: any) =>
          extensionBindings(["fR"], { Ie: overlay }).fR(
            handler,
            message,
            sender,
            reply,
          )
      : createCursorMessageHandler(overlay, handler);
    for (const message of [
      null,
      {},
      { type: "UNKNOWN" },
      { type: "GET_AGENT_CURSOR_STATE" },
      ...[undefined, 1.5, -1, 0, 8].map((moveSequence) => ({
        type: "AGENT_CURSOR_ARRIVED",
        sessionId: "s",
        turnId: "t",
        moveSequence,
      })),
      {
        type: "AGENT_CURSOR_ARRIVED",
        sessionId: 3,
        turnId: "t",
        moveSequence: 1,
      },
    ]) {
      for (const sender of [{}, { tab: {} }, { tab: { id: 1 } }])
        trace.push([
          "returned",
          listener(message, sender as any, (value: any) =>
            trace.push(["reply", value]),
          ),
        ]);
    }
    return trace;
  };
  assert.deepEqual(run(false), run(true));
});

test("observed tabs match original multi-window updates, event listeners and disposal", async () => {
  const run = async (original: boolean) => {
    const trace: any[] = [],
      registered = new Map<string, Set<Function>>();
    const event = (name: string) => {
      const listeners = new Set<Function>();
      registered.set(name, listeners);
      return {
        addListener(fn: Function) {
          trace.push(["add", name]);
          listeners.add(fn);
        },
        removeListener(fn: Function) {
          trace.push(["remove", name]);
          listeners.delete(fn);
        },
      };
    };
    let tabs: any[] = [
      { id: 1, windowId: 10 },
      { id: 2, windowId: 20 },
      { id: "bad", windowId: 30 },
    ];
    const chrome: any = {
      tabs: {
        query: async (options: any) => {
          trace.push(["query", options]);
          return tabs;
        },
      },
      windows: {},
    };
    for (const name of [
      "onActivated",
      "onCreated",
      "onRemoved",
      "onReplaced",
      "onAttached",
      "onDetached",
    ])
      chrome.tabs[name] = event("tabs." + name);
    for (const name of ["onCreated", "onFocusChanged", "onRemoved"])
      chrome.windows[name] = event("windows." + name);
    const Observed = original
      ? extensionBindings(["zu", "cS", "oS"], { chrome }).oS
      : createObservedTabsClass(chrome);
    const observed = new Observed({
      onChanged: (ids: number[]) => {
        trace.push(["changed", ids]);
        return Promise.reject(new Error("ignored callback error"));
      },
    });
    const states: any[] = [];
    const snap = () =>
      states.push([
        [...observed.activeTabIds],
        [...observed.activeTabIdByWindowId],
        observed.listenersRegistered,
      ]);
    await observed.initialize();
    snap();
    await observed.initialize();
    snap();
    observed.handleTabActivated({ windowId: 10, tabId: 3 });
    snap();
    observed.handleTabCreated({ active: false, id: 4, windowId: 20 });
    snap();
    observed.handleTabCreated({ active: true, id: 4, windowId: 20 });
    snap();
    observed.setChangeHandler((ids: number[]) =>
      trace.push(["changed-new", ids]),
    );
    tabs = [{ id: 5, windowId: 10 }];
    for (const listener of registered.get("windows.onFocusChanged")!)
      listener(10);
    await Promise.resolve();
    await Promise.resolve();
    snap();
    observed.dispose();
    observed.dispose();
    snap();
    await observed.initialize();
    snap();
    observed.dispose();
    return {
      trace,
      states,
      observed: [1, 2, 3, 4, 5].map((id) => observed.isObserved(id)),
      listeners: Array.from(registered, ([name, values]) => [
        name,
        values.size,
      ]),
      methods: Object.getOwnPropertyNames(Observed.prototype),
    };
  };
  const actual = await run(false);
  assert.deepEqual(actual, await run(true));
  assert.deepEqual(actual.states[0][0], [1, 2]);
  assert.ok(actual.listeners.every(([, size]) => size === 0));
});
