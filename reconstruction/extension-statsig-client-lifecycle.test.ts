import assert from "node:assert/strict";
import test from "node:test";
import { originalStatsigClientPrototype } from "./extension-statsig-source";
import { extensionBindings } from "./extension-source";
import { statsigClientLifecycle } from "../packages/browser-extension/src/statsig_client_lifecycle";
import { ExtensionStatsigDiagnostics } from "../packages/browser-extension/src/statsig_diagnostics";
function originalDiagnostics() {
  return extensionBindings(["vs"], {
    L: (f: Function) => () => {
      const exports = {};
      f(exports);
      return exports;
    },
  }).vs().Diagnostics;
}
const normalize = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      v instanceof Error ? { name: v.name, message: v.message } : v,
    ),
  );

test("client async lifecycle matches bundled initialization, user changes and in-place refresh", async () => {
  const previousNow = Date.now;
  try {
    for (const operation of [
      "initializeAsync",
      "updateUserAsync",
      "refreshValuesAsync",
    ]) {
      for (const mode of [
        "success",
        "missing",
        "rejected-values",
        "user-changed",
        "sync-throw",
        "async-throw",
        "logger-throw",
      ]) {
        const results = [];
        for (const restored of [false, true]) {
          let tick = 100;
          Date.now = () => tick++;
          const diagnostics = restored
            ? ExtensionStatsigDiagnostics
            : originalDiagnostics();
          diagnostics._clearMarkers("client-life");
          const trace: any[] = [];
          const Original = originalStatsigClientPrototype({
            core: { Diagnostics: diagnostics },
          });
          const host: any = Object.create(Original.prototype);
          if (restored) Object.assign(host, statsigClientLifecycle);
          let error: any = null;
          let source = "Cache";
          const cached = { source: "Cache", data: "cache", receivedAt: 1 };
          const fresh = { source: "Network", data: "fresh", receivedAt: 2 };
          Object.assign(host, {
            _sdkKey: "client-life",
            _user: { userID: "old" },
            loadingStatus: "Uninitialized",
            _options: null,
            _resetForUser(user: any) {
              trace.push(["reset", user]);
              this._user = { ...user };
            },
            _setStatus(status: string, data: any) {
              trace.push(["status", status, data]);
              this.loadingStatus = status;
            },
            _finalizeUpdate(data: any) {
              trace.push(["finalize", data]);
              this._setStatus("Ready", data);
            },
            _startLiveValuesAutoRefresh() {
              trace.push(["start-timer"]);
            },
            _createErrorUpdateDetails(err: Error, start: number) {
              assert.equal(typeof start, "number");
              trace.push(["caught", err]);
              return { caught: err };
            },
            $emt(event: any) {
              trace.push(["emit", event]);
            },
            _errorBoundary: {
              attachErrorIfNoneExists(value: any) {
                trace.push(["attach", value]);
                error ??= value;
              },
              getLastSeenErrorAndReset() {
                const value = error;
                error = null;
                return value;
              },
            },
            _network: {
              getLastUsedInitUrlAndReset() {
                trace.push(["url"]);
                return "fixture";
              },
            },
            _store: {
              setValues(data: any, user: any, loadedAt: any) {
                trace.push(["values", data, user, loadedAt]);
                if (data) source = data.source;
                return mode !== "rejected-values";
              },
              getSource: () => source,
              getCurrentSourceDetails: () => ({ source, reason: source }),
              getWarnings: () => ["warning"],
            },
            _logger: {
              start() {
                trace.push(["logger-start"]);
              },
              enqueue(event: any) {
                trace.push(["diagnostics", event]);
                if (mode === "logger-throw") throw "logger-failed";
              },
            },
            dataAdapter: {
              getDataSync(user: any) {
                trace.push(["cache", user]);
                if (mode === "sync-throw") throw "sync-failed";
                return cached;
              },
              async getDataAsync(data: any, user: any, options: any) {
                trace.push(["fetch", data, user, options]);
                if (mode === "async-throw") throw new Error("async-failed");
                if (mode === "user-changed") host._user = { userID: "changed" };
                return mode === "missing" ? null : fresh;
              },
            },
          });
          const options = { priority: "high" };
          const result =
            operation === "updateUserAsync"
              ? await host[operation]({ userID: "new" }, options)
              : await host[operation](options);
          results.push(
            normalize({
              result,
              trace,
              status: host.loadingStatus,
              markers: diagnostics._getMarkers("client-life"),
            }),
          );
          diagnostics._clearMarkers("client-life");
        }
        assert.deepEqual(results[1], results[0], `${operation}/${mode}`);
        if (operation === "refreshValuesAsync")
          assert.ok(
            !results[1].trace.some(
              (row: any) =>
                row[0] === "reset" ||
                (row[0] === "status" && row[1] === "Loading") ||
                row[0] === "emit",
            ),
          );
      }
    }
  } finally {
    Date.now = previousNow;
    ExtensionStatsigDiagnostics._clearMarkers("client-life");
  }
});

test("client initialization preserves promise coalescing, replacement and synchronous timer ordering", async () => {
  const Original = originalStatsigClientPrototype();
  for (const mode of [
    "ordinary",
    "replace",
    "reject",
    "sync",
    "already-ready",
  ]) {
    const traces = [];
    for (const restored of [false, true]) {
      const host: any = Object.create(Original.prototype);
      if (restored) Object.assign(host, statsigClientLifecycle);
      const trace: any[] = [];
      let resolve!: (value: any) => void;
      let reject!: (error: any) => void;
      const pending = new Promise((a, b) => {
        resolve = a;
        reject = b;
      });
      Object.assign(host, {
        _user: {},
        loadingStatus: mode === "already-ready" ? "Ready" : "Uninitialized",
        _store: { getSource: () => "Cache", getWarnings: () => [] },
        _logger: {
          start() {
            trace.push("logger");
          },
        },
        _initializeAsyncImpl() {
          trace.push("initialize");
          return pending;
        },
        _startLiveValuesAutoRefresh() {
          trace.push("timer");
        },
        updateUserSync() {
          trace.push("sync");
          return "result";
        },
      });
      if (mode === "sync" || mode === "already-ready") {
        trace.push(host.initializeSync());
        resolve(null);
      } else {
        const first = host.initializeAsync();
        const second = host.initializeAsync();
        if (mode === "replace")
          host._initializePromise = Promise.resolve("replaced");
        if (mode === "reject") reject(new Error("failed"));
        else resolve("result");
        trace.push(await Promise.allSettled([first, second]));
      }
      traces.push(normalize(trace));
    }
    assert.deepEqual(traces[1], traces[0], mode);
  }
});
