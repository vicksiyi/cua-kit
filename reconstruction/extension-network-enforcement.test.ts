import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createNetworkPolicyEnforcer } from "../packages/browser-extension/src/network_policy_enforcement";
const bindings = [
  "JS",
  "XS",
  "YS",
  "QS",
  "eE",
  "dd",
  "tE",
  "hd",
  "Kr",
  "fd",
  "Zr",
  "rE",
  "nE",
  "Ha",
  "iE",
  "sE",
  "pd",
  "Ae",
];
function fixture(useOriginal: boolean, scenario: string) {
  const trace: any[] = [],
    events = new Set<Function>(),
    detaches = new Set<Function>(),
    timers = new Map<number, Function>();
  let now = 100,
    timerId = 0,
    treeCalls = 0,
    changedOnce = false,
    attachedChild = false;
  const host: any = {
    now: () => now,
    setTimeout(fn: Function, ms: number) {
      const id = ++timerId;
      trace.push(["timer", id, ms]);
      timers.set(id, fn);
      if (ms === 10)
        queueMicrotask(() => {
          now += 10;
          timers.delete(id);
          fn();
        });
      return id;
    },
    clearTimeout(id: number) {
      trace.push(["clear", id]);
      timers.delete(id);
    },
  };
  const emit = (
    method: string,
    params?: any,
    sessionId?: string,
    tabId = 1,
  ) => {
    for (const callback of events)
      callback(
        { tabId, ...(sessionId === undefined ? {} : { sessionId }) },
        method,
        params,
      );
  };
  const context = (id: number, origin: string, frameId = "root") =>
    emit("Runtime.executionContextCreated", {
      context: { id, origin, auxData: { frameId, isDefault: true } },
    });
  const chrome: any = {
    tabs: {
      async get(id: number) {
        trace.push(["tab", id]);
        return scenario === "loading"
          ? { status: "loading" }
          : { status: "complete" };
      },
    },
    debugger: {
      onEvent: {
        addListener(fn: Function) {
          trace.push(["event+"]);
          events.add(fn);
        },
        removeListener(fn: Function) {
          trace.push(["event-"]);
          events.delete(fn);
        },
      },
      onDetach: {
        addListener(fn: Function) {
          trace.push(["detach+"]);
          detaches.add(fn);
        },
        removeListener(fn: Function) {
          trace.push(["detach-"]);
          detaches.delete(fn);
        },
      },
      async attach(target: any, version: string) {
        trace.push(["attach", target, version]);
        if (scenario === "attach-fail") throw Error("attach failed");
      },
      async detach(target: any) {
        trace.push(["detach", target]);
        if (scenario === "detach-fail") throw Error("detach failed");
      },
      async sendCommand(target: any, method: string, params: any) {
        trace.push(["command", target, method, params]);
        if (scenario === "command-fail" && method === "Page.enable")
          throw Error("command failed");
        if (scenario === "detached" && method === "Page.enable")
          for (const callback of detaches) callback({ tabId: 1 });
        if (
          method === "Target.setAutoAttach" &&
          scenario === "child" &&
          !attachedChild
        ) {
          attachedChild = true;
          emit("Target.attachedToTarget", {
            sessionId: "child",
            targetInfo: { type: "iframe" },
          });
        }
        if (method === "Runtime.enable") {
          context(
            1,
            scenario === "blank-inherited"
              ? "https://allowed.test"
              : scenario === "blank-colon"
                ? "://"
                : "null",
          );
          if (scenario === "blank-ambiguous") context(2, "https://other.test");
        }
        if (method === "Target.getTargetInfo")
          return {
            targetInfo: { canAccessOpener: scenario === "blank-opener" },
          };
        if (method === "Page.getFrameTree") {
          treeCalls++;
          if (scenario === "tree-null") return null;
          if (scenario === "tree-bad")
            return {
              frameTree: {
                frame: { id: "root", url: "https://allowed.test" },
                childFrames: {},
              },
            };
          if (scenario === "navigation" && !changedOnce) {
            changedOnce = true;
            emit("Page.frameNavigated", {});
            throw Error("navigation race");
          }
          if (scenario === "loading-event" && !changedOnce) {
            changedOnce = true;
            emit("Page.frameStartedLoading", { frameId: "root" });
            queueMicrotask(() =>
              emit("Page.frameStoppedLoading", { frameId: "root" }),
            );
          }
          if (scenario === "ignored-event") {
            emit("Page.frameNavigated", {}, undefined, 9);
            emit("Unknown.event", {});
            emit("Runtime.executionContextCreated", {
              context: { id: 1, origin: "null", auxData: { isDefault: false } },
            });
          }
          let url = scenario.startsWith("blank")
            ? "about:blank"
            : scenario === "blob"
              ? "blob:https://allowed.test/id"
              : scenario === "data"
                ? "data:text/plain,hello"
                : scenario === "blocked" || target.sessionId
                  ? "https://blocked.test/path"
                  : "https://allowed.test/path?q=1#hash";
          const frame: any = { frame: { id: target.sessionId ?? "root", url } };
          if (scenario === "srcdoc")
            frame.childFrames = [
              { frame: { id: "sub", parentId: "root", url: "about:srcdoc" } },
            ];
          if (scenario === "srcdoc-cycle")
            frame.childFrames = [
              { frame: { id: "sub", parentId: "sub", url: "about:srcdoc" } },
            ];
          return { frameTree: frame };
        }
        return {};
      },
    },
  };
  host.chrome = chrome;
  const enforce = useOriginal
    ? extensionBindings(bindings, {
        chrome,
        Date: { now: host.now },
        setTimeout: host.setTimeout,
        clearTimeout: host.clearTimeout,
      }).JS
    : createNetworkPolicyEnforcer(host);
  return {
    enforce,
    host,
    trace,
    events,
    detaches,
    timers,
    get treeCalls() {
      return treeCalls;
    },
  };
}
async function run(useOriginal: boolean, scenario: string) {
  const f = fixture(useOriginal, scenario);
  let error: string | undefined;
  const decisions: string[] = [];
  try {
    await f.enforce(1, scenario === "expired" ? 100 : 140, (url: string) => {
      decisions.push(url);
      return new URL(url).hostname === "allowed.test";
    });
  } catch (e: any) {
    error = e.message;
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.events.size, 0);
  assert.equal(f.detaches.size, 0);
  assert.equal(f.timers.size, 0);
  return { trace: f.trace, error, decisions, treeCalls: f.treeCalls };
}
test("active-page enforcement matches original attach, stable-frame inspection, origin handling and cleanup", async () => {
  for (const scenario of [
    "allowed",
    "blocked",
    "srcdoc",
    "srcdoc-cycle",
    "blob",
    "data",
    "blank",
    "blank-colon",
    "blank-inherited",
    "blank-opener",
    "blank-ambiguous",
    "child",
    "navigation",
    "loading-event",
    "ignored-event",
    "loading",
    "expired",
    "tree-null",
    "tree-bad",
    "attach-fail",
    "detach-fail",
    "command-fail",
    "detached",
  ]) {
    assert.deepEqual(
      await run(false, scenario),
      await run(true, scenario),
      scenario,
    );
  }
  assert.deepEqual((await run(false, "allowed")).decisions, [
    "https://allowed.test/path?q=1",
  ]);
  assert.match(
    (await run(false, "blocked")).error!,
    /outside the current policy: https:\/\/blocked.test/,
  );
  assert.equal((await run(false, "blank")).error, undefined);
  assert.match(
    (await run(false, "srcdoc-cycle")).error!,
    /could not be established/,
  );
});

test("deadline race clears listeners immediately and detaches a late debugger attachment", async () => {
  async function exercise(original: boolean) {
    const f = fixture(original, "allowed");
    let release!: () => void;
    f.host.chrome.debugger.attach = async (
      target: unknown,
      version: string,
    ) => {
      f.trace.push(["attach", target, version]);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const pending = f
      .enforce(1, 140, () => true)
      .then(
        () => "ok",
        (error: Error) => error.message,
      );
    assert.equal(f.timers.size, 1);
    [...f.timers.values()][0]();
    const error = await pending;
    assert.match(error, /failed to settle/);
    assert.equal(f.events.size, 0);
    assert.equal(f.detaches.size, 0);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.trace.filter((entry) => entry[0] === "detach").length, 1);
    return { trace: f.trace, error };
  }
  assert.deepEqual(await exercise(false), await exercise(true));
});
