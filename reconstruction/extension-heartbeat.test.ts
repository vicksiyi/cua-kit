import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  registerClientHeartbeat,
  CLIENT_HEARTBEAT_ALARM,
} from "../packages/browser-extension/src/client_heartbeat";
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function scenario(upstream: boolean, mode: string) {
  const trace: any[] = [],
    callbacks: Function[] = [],
    timers: Function[] = [];
  let releasePolicy!: () => void;
  const policyGate = new Promise<void>((resolve) => {
    releasePolicy = resolve;
  });
  const chrome: any = {
    alarms: {
      async get(name: string) {
        trace.push(["get", name]);
        return mode === "existing" ? {} : undefined;
      },
      async create(name: string, options: any) {
        trace.push(["create", name, options]);
      },
      onAlarm: {
        addListener(fn: Function) {
          trace.push(["listen"]);
          callbacks.push(fn);
        },
      },
    },
    debugger: {
      async getTargets() {
        trace.push(["targets"]);
        if (mode === "targets-fail") throw Error("targets failed");
        return [
          { tabId: 1 },
          { tabId: 2 },
          { id: "worker" },
          { tabId: "3" },
          { tabId: 0 },
        ];
      },
      async detach(target: any) {
        trace.push(["detach", target]);
        if (target.tabId === 2) throw Error("detach failed");
      },
    },
  };
  const reconcile = async () => {
    trace.push(["reconcile"]);
    if (mode === "reconcile-fail") throw Error("reconcile failed");
  };
  const stop = async () => {
    trace.push(["stop"]);
    if (mode === "stop-fail") throw Error("stop failed");
  };
  const policy = async () => {
    trace.push(["policy"]);
    if (mode === "policy-pending") await policyGate;
    if (mode === "policy-fail") throw Error("policy failed");
  };
  const setTimeout = ((fn: Function, delay: number) => {
    trace.push(["timer", delay]);
    timers.push(fn);
    return 1;
  }) as any;
  const diagnostics = {
    reportError: (error: any, operation: string) =>
      trace.push(["error", error.message, operation]),
    console: {
      error: (value: string) => trace.push(["console-error", value]),
      warn: (value: string) => trace.push(["warn", value]),
    },
    reportMetric: (...args: any[]) => trace.push(["metric", ...args]),
  };
  const pings =
    mode === "no-pings"
      ? []
      : [
          () => {
            trace.push(["ping", 1]);
            if (mode === "sync-throw") throw Error("sync ping");
            if (["healthy", "existing", "reconcile-fail"].includes(mode))
              return Promise.resolve(true);
            if (mode === "false-first") return Promise.resolve(false);
            return Promise.reject(Error("unavailable"));
          },
          () => {
            trace.push(["ping", 2]);
            return mode === "false-first"
              ? new Promise((resolve) => setImmediate(() => resolve(true)))
              : new Promise(() => {});
          },
        ];
  if (upstream)
    await extensionBindings(["Ho", "Gk"], {
      chrome,
      setTimeout,
      st: { getInstance: () => ({ reconcileRequestHeaders: reconcile }) },
      Ie: { stopActiveSessions: stop },
      ar: { getInstance: () => ({ detachAll: policy }) },
      zi: diagnostics.reportError,
      console: diagnostics.console,
      Yt: diagnostics.reportMetric,
    }).Gk(...pings);
  else
    await registerClientHeartbeat(
      {
        chrome,
        setTimeout,
        reconcileRequestHeaders: reconcile,
        stopActiveSessions: stop,
        detachAllNetworkPolicies: policy,
        ...diagnostics,
      },
      ...pings,
    );
  await callbacks[0]({ name: "other" });
  let settled = false;
  const work = callbacks[0]({ name: CLIENT_HEARTBEAT_ALARM }).then(
    () => {
      settled = true;
      return "done";
    },
    (error: Error) => {
      settled = true;
      return error.message;
    },
  );
  await flush();
  if (
    ![
      "healthy",
      "existing",
      "reconcile-fail",
      "sync-throw",
      "false-first",
    ].includes(mode)
  ) {
    assert.equal(settled, false);
    for (const timer of timers) timer();
    await flush();
  }
  if (mode === "policy-pending") {
    assert.equal(settled, true);
    releasePolicy();
  }
  const result = await work;
  await flush();
  return { trace, result };
}
test("heartbeat preserves alarm setup, first fulfilled ping semantics, timeout and cleanup ordering", async () => {
  for (const mode of [
    "healthy",
    "existing",
    "no-pings",
    "false-first",
    "sync-throw",
    "offline",
  ]) {
    const actual = await scenario(false, mode);
    assert.deepEqual(actual, await scenario(true, mode), mode);
    assert.equal(
      actual.trace.some((row) => row[0] === "stop"),
      !["healthy", "existing"].includes(mode),
    );
  }
});
test("heartbeat preserves reconciliation isolation, cleanup failures and unawaited policy detachment", async () => {
  for (const mode of [
    "reconcile-fail",
    "stop-fail",
    "targets-fail",
    "policy-fail",
    "policy-pending",
  ])
    assert.deepEqual(
      await scenario(false, mode),
      await scenario(true, mode),
      mode,
    );
});
