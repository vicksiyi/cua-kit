import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createDebuggerRuntime,
  parseViewportSize,
} from "../packages/browser-extension/src/debugger_runtime";
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const outcome = async (run: () => any) => {
  try {
    return { value: await run() };
  } catch (error: any) {
    return { error: error?.message ?? error, name: error?.name };
  }
};
function fixture(original: boolean) {
  const trace: any[] = [],
    listeners: any[] = [],
    timers = new Map<number, () => void>();
  let timerId = 0;
  const state = {
    attachError: null as any,
    detachError: null as any,
    commandError: null as any,
    commandPending: false,
  };
  let finishCommand: (value: any) => void = () => {};
  const chrome: any = {
    debugger: {
      onDetach: {
        addListener(fn: any) {
          trace.push(["listen"]);
          listeners.push(fn);
        },
      },
      async attach(...args: any[]) {
        trace.push(["attach", ...args]);
        if (state.attachError != null) throw state.attachError;
      },
      async detach(...args: any[]) {
        trace.push(["detach", ...args]);
        if (state.detachError != null) throw state.detachError;
      },
      async getTargets() {
        trace.push(["targets"]);
        return [{ id: "target", title: "Page", tabId: 3 }];
      },
      sendCommand(...args: any[]) {
        trace.push(["send", ...args]);
        if (state.commandError != null) throw state.commandError;
        if (state.commandPending)
          return new Promise((resolve) => {
            finishCommand = resolve;
          });
        return Promise.resolve({ value: 1 });
      },
    },
  };
  const host: any = {
    chrome,
    setTimeout(fn: any, ms: number) {
      trace.push(["timer", ms]);
      timers.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id: number) {
      trace.push(["clear", id]);
      timers.delete(id);
    },
  };
  let runtime: any;
  if (original) {
    const attachedTabs = new Set(),
      attachedTargets = new Set(),
      targetOwners = new Map(),
      tabOperations = new Map(),
      targetOperations = new Map();
    const old = extensionBindings(
      [
        "fE",
        "yd",
        "mE",
        "Sd",
        "gE",
        "Ed",
        "Td",
        "_E",
        "yi",
        "kd",
        "Rd",
        "Va",
        "Pd",
        "NE",
        "xd",
        "Md",
        "UE",
      ],
      {
        ...host,
        wt: attachedTabs,
        gi: attachedTargets,
        _i: targetOwners,
        vi: tabOperations,
        bi: targetOperations,
        vd: false,
        uE: 10000,
      },
    );
    runtime = {
      attachedTabs,
      attachedTargets,
      targetOwners,
      tabOperations,
      targetOperations,
      initializeDebugger: old.fE,
      attachDebugger: old.yd,
      attachDebuggerTarget: old.mE,
      setViewport: old.Sd,
      detachDebugger: old.Ed,
      detachDebuggerTarget: old.Td,
      detachAfterTimeout: old._E,
      runTabOperation: old.yi,
      runTargetOperation: old.kd,
      sendCdpRaw: old.Va,
      sendCdp: old.Pd,
      isCdpTimeout: old.Md,
    };
  } else runtime = createDebuggerRuntime(host);
  return {
    runtime,
    trace,
    state,
    timers,
    listeners,
    finish: (value: any) => finishCommand(value),
  };
}
async function compare(
  run: (fixture: ReturnType<typeof fixture>) => Promise<any>,
) {
  const a = fixture(true),
    b = fixture(false);
  assert.deepEqual(await run(b), await run(a));
  assert.deepEqual(b.trace, a.trace);
  for (const key of ["attachedTabs", "attachedTargets", "targetOwners"])
    assert.deepEqual(b.runtime[key], a.runtime[key]);
  assert.equal(b.runtime.tabOperations.size, 0);
  assert.equal(b.runtime.targetOperations.size, 0);
}
test("extension debugger attach/detach and viewport rules match original state and error handling", async () => {
  await compare(async ({ runtime: r, state, listeners }) => {
    const results = [];
    r.initializeDebugger();
    r.initializeDebugger();
    await r.attachDebugger(1);
    await r.attachDebugger(1);
    await r.attachDebugger(1, { width: 800, height: 600 });
    await r.attachDebugger(1, null);
    state.attachError = { message: "Another debugger attached" };
    await r.attachDebugger(2);
    await r.attachDebuggerTarget(2, "child");
    await r.attachDebuggerTarget(9, "child");
    state.attachError = Error("permission denied");
    results.push(
      await outcome(() => r.attachDebugger(3)),
      await outcome(() => r.attachDebuggerTarget(3, "bad")),
    );
    state.attachError = null;
    state.commandError = Error("viewport failed");
    results.push(
      await outcome(() => r.attachDebugger(3, { width: 1, height: 1 })),
    );
    state.commandError = null;
    state.detachError = Error("detach failed");
    results.push(
      await outcome(() => r.detachDebugger(2)),
      await outcome(() => r.detachDebuggerTarget("child")),
    );
    await r.detachAfterTimeout(1);
    state.detachError = null;
    await r.attachDebugger(5);
    await r.attachDebuggerTarget(5, "five");
    listeners[0]({ tabId: 5, targetId: "five" });
    results.push(
      [...r.attachedTabs],
      [...r.attachedTargets],
      [...r.targetOwners],
    );
    return results;
  });
  const old = extensionBindings(["gE"], {});
  for (const value of [
    undefined,
    null,
    "",
    "0x1",
    "01x1",
    "800x600",
    "1X2",
    "1x2 ",
    "9".repeat(400) + "x1",
  ])
    assert.deepEqual(parseViewportSize(value), old.gE(value));
});
test("extension debugger command target selection, timeout errors and late completion match original", async () => {
  await compare(async ({ runtime: r, state, timers, finish }) => {
    const results = [];
    results.push(await r.sendCdpRaw({ method: "Target.getTargets" }));
    results.push(
      await r.sendCdpRaw({
        target: { targetId: "child", tabId: 1, sessionId: "session" },
        method: "Runtime.evaluate",
        commandParams: { expression: "1" },
      }),
    );
    for (const timeoutMs of [undefined, 0, -1, Infinity, NaN, "10", 0.5, 50])
      results.push(
        await r.sendCdp({
          target: { tabId: 1 },
          method: "Page.enable",
          timeoutMs,
        }),
      );
    state.commandError = Error("send failed");
    results.push(
      await outcome(() =>
        r.sendCdp({ target: { tabId: 1 }, method: "Page.enable" }),
      ),
    );
    state.commandError = null;
    state.commandPending = true;
    let timedOut: any;
    const pending = r
      .sendCdp({ target: { tabId: 1 }, method: "Page.navigate", timeoutMs: 5 })
      .catch((error: any) => {
        timedOut = error;
        return { error: error.message, name: error.name };
      });
    for (const timer of timers.values()) timer();
    results.push(
      await pending,
      r.isCdpTimeout(timedOut),
      r.isCdpTimeout({ name: "CdpCommandTimeoutError" }),
    );
    finish({ late: true });
    await flush();
    results.push(timers.size);
    return results;
  });
});
test("extension debugger serializes same-key operations, allows different keys and recovers after rejection", async () => {
  await compare(async ({ runtime: r, trace }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = outcome(() =>
      r.runTabOperation(1, async () => {
        trace.push(["first"]);
        await gate;
        throw Error("failure");
      }),
    );
    const second = r.runTabOperation(1, async () => {
      trace.push(["second"]);
      return 2;
    });
    const other = r.runTabOperation(2, async () => {
      trace.push(["other"]);
      return 3;
    });
    const target = r.runTargetOperation("1", async () => {
      trace.push(["target"]);
      return 4;
    });
    await flush();
    assert.equal(
      trace.some((entry) => entry[0] === "second"),
      false,
    );
    release();
    return [await first, await second, await other, await target];
  });
});
