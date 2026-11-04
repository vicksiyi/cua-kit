import assert from "node:assert/strict";
import test from "node:test";
import { originalStatsigClientPrototype } from "./extension-statsig-source";
import { createStatsigLiveRefresh } from "../packages/browser-extension/src/statsig_live_refresh";
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("live refresh matches timer lifecycle, overlap prevention, stale responses and cursor updates", async () => {
  for (const mode of [
    "normal",
    "disabled",
    "uninitialized",
    "loading",
    "user-changed",
    "values-changed",
    "null",
    "cursor",
    "rejected-value",
    "failure",
    "replaced-client",
    "server",
    "stop-inflight",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        timers = new Map<number, Function>();
      let nextTimer = 0;
      const setInterval = ((fn: Function, delay: number) => {
        const id = ++nextTimer;
        timers.set(id, fn);
        trace.push(["interval", id, delay]);
        return id;
      }) as any;
      const clearInterval = ((id: number) => {
        timers.delete(id);
        trace.push(["clear", id]);
      }) as any;
      const error = (message: string, value: Error) => {
        trace.push(["error", message, value.message]);
      };
      let instances: any = {};
      const Original = originalStatsigClientPrototype({
        setInterval,
        clearInterval,
        Date: { now: () => 99 },
        core: {
          _getStatsigGlobal: () => ({ instances }),
          _isServerEnv: () => mode === "server",
          Log: { error },
        },
      });
      const client: any = upstream ? Object.create(Original.prototype) : {};
      let values: any = {
        sdk_configs: { live_values_auto_refresh_interval_seconds: 2 },
      };
      let resolve!: (value: any) => void, reject!: (error: Error) => void;
      const pending = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      Object.assign(client, {
        _sdkKey: "fixture",
        _user: { userID: "u" },
        loadingStatus:
          mode === "uninitialized"
            ? "Uninitialized"
            : mode === "loading"
              ? "Loading"
              : "Ready",
        _liveValuesAutoRefreshIntervalMs:
          mode === "disabled" ? undefined : 600000,
        _liveValuesAutoRefreshTimer: null,
        _store: {
          getValues: () => values,
          getLiveCursor: () => ({
            sinceTime: 1,
            previousDerivedFields: { v: 1 },
            fullChecksum: "sum",
          }),
          advanceLiveCursor(time: number) {
            trace.push(["advance", time]);
            return true;
          },
          setLiveValues(value: any, time: number) {
            trace.push(["set", value, time]);
            return mode !== "rejected-value";
          },
        },
        _network: {
          fetchLiveEvaluations(...args: unknown[]) {
            trace.push(["fetch", ...args]);
            return pending;
          },
        },
        _setStatus(...args: unknown[]) {
          trace.push(["status", ...args]);
        },
      });
      const isClient = (value: unknown): value is any =>
        value != null && (value === client || value === instances.fixture);
      const api = upstream
        ? {
            start: () => client._startLiveValuesAutoRefresh(),
            stop: () => client._stopLiveValuesAutoRefresh(),
            intervalMs: () => client._getLiveValuesAutoRefreshIntervalMs(),
          }
        : createStatsigLiveRefresh(client, mode !== "disabled", {
            isClient,
            globalInstances: () => instances,
            isServer: () => mode === "server",
            setInterval,
            clearInterval,
            now: () => 99,
            error,
          });
      trace.push(["delay", api.intervalMs()]);
      api.start();
      api.start();
      if (mode === "replaced-client" || mode === "server") {
        instances.fixture = Object.create(Original.prototype);
        instances.fixture.loadingStatus = "Ready";
      }
      for (const tick of [...timers.values()]) {
        tick();
        tick();
      }
      if (mode === "user-changed") client._user = { userID: "other" };
      if (mode === "values-changed") values = {};
      if (mode === "stop-inflight") api.stop();
      if (mode === "failure") reject(Error("fixture failure"));
      else
        resolve(
          mode === "null"
            ? null
            : mode === "cursor"
              ? { hasUpdates: false, lcut: 8 }
              : { hasUpdates: true, values: { time: 7 } },
        );
      // Pending may be deliberately unused when no tick runs.
      await pending.catch(() => {});
      await flush();
      for (const tick of [...timers.values()]) tick();
      await flush();
      api.stop();
      api.stop();
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
test("live refresh interval uses finite positive seconds and does not substitute for disabled state", () => {
  const Original = originalStatsigClientPrototype();
  for (const seconds of [undefined, null, 0, -1, NaN, Infinity, "5", 0.5, 5]) {
    const client: any = Object.create(Original.prototype);
    client._liveValuesAutoRefreshIntervalMs = 600000;
    client._store = {
      getValues: () => ({
        sdk_configs: { live_values_auto_refresh_interval_seconds: seconds },
      }),
    };
    const restored = createStatsigLiveRefresh(client, true, {
      isClient: (_value): _value is any => false,
    });
    assert.equal(
      restored.intervalMs(),
      client._getLiveValuesAutoRefreshIntervalMs(),
    );
  }
});
