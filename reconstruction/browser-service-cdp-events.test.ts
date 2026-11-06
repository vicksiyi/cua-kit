import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  serviceClassMethod,
  serviceClassWithMethods,
  serviceSourceSha256,
  originalServiceBindings,
} from "./service-source";
import { waitForCdpEvent } from "../packages/browser/src/service/cdp/event_wait";
import { screencastMethods } from "../packages/browser/src/service/cdp/screencast_methods";
import { captureTabScreenshot } from "../packages/browser/src/service/commands/screenshot";
const names = [
  "withInternalScreencast",
  "withScreencastLock",
  "isInternalScreencastEvent",
  "isCurrentInternalScreencastEvent",
  "activeRetiredInternalScreencastSessions",
  "retireInternalScreencast",
];
assert.equal(serviceSourceSha256, "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
  "Re-audit screenshot helpers for changed browser-service artifact");
const sourceClass = serviceClassWithMethods([...names, "waitForEvent"]);
const deps = originalServiceBindings(["Ao", "$h", "t2", "yte", "wte"]);
const originalMethods = new Function(
  ...Object.keys(deps),
  "return {" +
    names.map((name) => serviceClassMethod(sourceClass, name)).join(",") +
    "};",
)(...Object.values(deps));
const originalWait = new Function(
  "return {" + serviceClassMethod(sourceClass, "waitForEvent") + "}.waitForEvent;",
)();
// Current Wi is the capture algorithm; this integration fixture does not exercise
// an authority/credential gate. Do not infer gate parity from these scenarios.
const originalCapture = originalServiceBindings([
  "H", "an", "Dee", "Mee", "Bee", "tN", "wv", "Uee",
  "Lee", "Fee", "Nee", "Oee", "Wi",
]).Wi;

function owner(methods: any) {
  return Object.assign(
    new EventEmitter(),
    {
      activeInternalScreencastsByTabId: new Map(),
      screencastQueuesByTabId: new Map(),
      rawScreencastTabIds: new Set(),
      retiredInternalScreencastSessionsByTabId: new Map(),
    },
    methods,
  );
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: { name: error.name, message: error.message } };
  }
}
const event = (id = 1, sessionId = 5, extra = {}) => ({
  source: { tabId: id },
  method: "Page.screencastFrame",
  params: { sessionId, data: "frame", metadata: { timestamp: 100 } },
  ...extra,
});
async function waitScenario(wait: any, kind: string) {
  const emitter = new EventEmitter(),
    controller = new AbortController(),
    calls: any[] = [];
  if (kind === "preabort") controller.abort();
  const options: any = {
    signal: controller.signal,
    timeoutMs: 5,
    timeoutMessage: "deadline",
    action: async () => {
      calls.push("action");
      if (kind === "action-error") throw new Error("action failed");
      if (kind === "abort") {
        controller.abort();
        return;
      }
      if (kind === "timeout" || kind === "initial" || kind === "initial-error")
        return;
      emitter.emit("event", event(2));
      emitter.emit("event", event(1));
      emitter.emit("event", event(1, 6));
    },
  };
  if (kind === "initial") options.initialCheck = async () => true;
  if (kind === "initial-error")
    options.initialCheck = async () => {
      throw new Error("initial failed");
    };
  const result = await outcome(() =>
    wait.call(
      emitter,
      kind === "invalid" ? "bad" : "1",
      (value: any) => {
        calls.push(["predicate", value.params.sessionId]);
        if (kind === "predicate-error") throw new Error("predicate failed");
        if (kind === "predicate-value") throw "value failure";
        return true;
      },
      options,
    ),
  );
  return { result, calls, listeners: emitter.listenerCount("event") };
}
test("CDP wait preserves numeric validation, target filtering, first settlement, actions, abort, checks and cleanup", async () => {
  for (const kind of [
    "event",
    "invalid",
    "preabort",
    "abort",
    "timeout",
    "initial",
    "initial-error",
    "action-error",
    "predicate-error",
    "predicate-value",
  ])
    assert.deepEqual(
      await waitScenario(waitForCdpEvent, kind),
      await waitScenario(originalWait, kind),
      kind,
    );
});
async function lockScenario(methods: any) {
  const state = owner(methods),
    trace: string[] = [];
  let release: any;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const first = state.withScreencastLock(1, async () => {
    trace.push("a:start");
    await blocker;
    trace.push("a:end");
    throw new Error("a failed");
  });
  const observed = outcome(() => first);
  const second = state.withScreencastLock(1, async () => {
    trace.push("b");
    return "b";
  });
  const other = state.withScreencastLock(2, async () => {
    trace.push("c");
    return "c";
  });
  await other;
  trace.push("release");
  release();
  return {
    first: await observed,
    second: await second,
    trace,
    queues: state.screencastQueuesByTabId.size,
  };
}
test("screencast lock serializes each tab while allowing other tabs and releasing after failure", async () => {
  assert.deepEqual(
    await lockScenario(screencastMethods),
    await lockScenario(originalMethods),
  );
});
async function sessionScenario(methods: any) {
  const state = owner(methods),
    trace: any[] = [];
  let previousMatcher: any;
  const first = await state.withInternalScreencast(
    "1",
    async (matches: any) => {
      previousMatcher = matches;
      for (const value of [
        event(),
        event(1, 6, { source: { tabId: 1, sessionId: "child" } }),
        event(1, 7, { source: { tabId: 1, targetId: "target" } }),
        event(1, 8, { method: "Page.screencastVisibilityChanged" }),
        event(1, NaN),
      ])
        trace.push([state.isInternalScreencastEvent(1, value), matches(value)]);
      return "first";
    },
  );
  trace.push([
    "after",
    previousMatcher(event()),
    state.isInternalScreencastEvent(1, event()),
  ]);
  const next = await state.withInternalScreencast(1, async (matches: any) => {
    trace.push([
      "retired",
      state.isInternalScreencastEvent(1, event()),
      matches(event()),
    ]);
    const fresh = event(1, 9);
    trace.push([
      "fresh",
      state.isInternalScreencastEvent(1, fresh),
      matches(fresh),
    ]);
    return "next";
  });
  state.rawScreencastTabIds.add(1);
  const suppressed = await state.withInternalScreencast(1, async () => {
    throw new Error("must not run");
  });
  state.retireInternalScreencast(2, {
    sessionIds: new Set(Array.from({ length: 40 }, (_, i) => i)),
  });
  const retired = [...state.activeRetiredInternalScreencastSessions(2)];
  return {
    first,
    next,
    suppressed,
    trace,
    retired,
    active: state.activeInternalScreencastsByTabId.size,
    queues: state.screencastQueuesByTabId.size,
  };
}
test("internal screencast tracks root sessions, excludes retired frames, suppresses raw capture and caps retirement", async () => {
  const now = Date.now;
  Date.now = () => 1000;
  try {
    assert.deepEqual(
      await sessionScenario(screencastMethods),
      await sessionScenario(originalMethods),
    );
  } finally {
    Date.now = now;
  }
});
test("retired sessions expire at 10 seconds and callback failures still retire observed sessions", async () => {
  const now = Date.now;
  try {
    for (const methods of [screencastMethods, originalMethods]) {
      let time = 1000;
      Date.now = () => time;
      const state = owner(methods);
      await assert.rejects(
        state.withInternalScreencast(1, async () => {
          state.isInternalScreencastEvent(1, event());
          throw new Error("failure");
        }),
        /failure/,
      );
      assert.equal(state.activeInternalScreencastsByTabId.size, 0);
      time = 10999;
      assert.equal(state.activeRetiredInternalScreencastSessions(1).size, 1);
      time = 11000;
      assert.equal(state.activeRetiredInternalScreencastSessions(1).size, 0);
      assert.equal(state.retiredInternalScreencastSessionsByTabId.size, 0);
    }
  } finally {
    Date.now = now;
  }
});
async function captureScenario(
  methods: any,
  wait: any,
  capture: any,
  raw = false,
) {
  const state = owner(methods),
    calls: any[] = [];
  state.waitForEvent = wait;
  if (raw) state.rawScreencastTabIds.add(1);
  state.call = async (tab: any, method: any, params: any, options: any) => {
    calls.push([tab, method, params, options]);
    switch (method) {
      case "Runtime.evaluate":
        return { result: { value: 2 } };
      case "Page.getLayoutMetrics":
        return {
          cssVisualViewport: {
            pageX: 0,
            pageY: 0,
            clientWidth: 80,
            clientHeight: 60,
          },
        };
      case "Page.startScreencast":
        queueMicrotask(() => {
          const frame = event();
          state.isInternalScreencastEvent(1, frame);
          state.emit("event", frame);
        });
        return {};
      case "Page.captureScreenshot":
        return { data: "fallback" };
      default:
        return {};
    }
  };
  const value = await capture({ tab_id: "1" }, { cdp: state }, "css");
  return {
    value,
    calls,
    active: state.activeInternalScreencastsByTabId.size,
    queues: state.screencastQueuesByTabId.size,
    listeners: state.listenerCount("event"),
    retired: [...state.retiredInternalScreencastSessionsByTabId],
  };
}
test("screenshot algorithm integrates with reconstructed event wait and screencast ownership without replacing them with fixtures", async () => {
  const now = Date.now;
  Date.now = () => 100000;
  try {
    for (const raw of [false, true])
      assert.deepEqual(
        await captureScenario(
          screencastMethods,
          waitForCdpEvent,
          captureTabScreenshot,
          raw,
        ),
        await captureScenario(
          originalMethods,
          originalWait,
          originalCapture,
          raw,
        ),
      );
  } finally {
    Date.now = now;
  }
});
