import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { extensionBindings } from "./extension-source";
import { createExtensionFeatureService } from "../packages/browser-extension/src/feature_service";
const names = [
  "Ts",
  "Jm",
  "Nn",
  "Xm",
  "Un",
  "Yt",
  "Mr",
  "Is",
  "Qm",
  "As",
  "rl",
  "nl",
  "$n",
  "Cs",
  "eg",
  "tg",
];
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("extension feature service matches identity, refresh, subscriptions and telemetry queue", async () => {
  for (const mode of [
    "normal",
    "anonymous",
    "auth-fails",
    "storage-fails",
    "init-unsuccessful",
    "init-rejects",
    "sync-update-fails",
    "flush-twice",
    "flush-missing",
    "log-fails",
    "pre-aborted",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        clients: Client[] = [];
      let userId = "u1",
        stable: any = "fixture-stable",
        initializations = 0;
      const readAuth: any = async (signal: AbortSignal) => {
        trace.push(["auth", userId, signal.aborted]);
        if (mode === "auth-fails") throw Error("auth");
        return mode === "anonymous"
          ? { status: 200, session: null }
          : {
              status: 200,
              session: {
                accessToken: "fixture",
                account: { userId, id: "a", structure: "personal" },
                email: " user@example.test ",
              },
            };
      };
      const chrome: any = {
        runtime: { getManifest: () => ({ version: "1" }) },
        storage: {
          local: {
            async get(keys: unknown) {
              trace.push(["get", keys]);
              if (mode === "storage-fails") throw Error("storage");
              return { codexToolbarStateTelemetryId: stable };
            },
            async set(value: any) {
              trace.push(["set", value]);
              stable = value.codexToolbarStateTelemetryId;
            },
          },
        },
      };
      class Client {
        loadingStatus = "Uninitialized";
        handlers = new Map<string, Set<Function>>();
        events: any[] = [];
        flushes = 0;
        constructor(
          key: string,
          public user: any,
          options: any,
        ) {
          const { networkConfig, ...rest } = options;
          trace.push([
            "client",
            key,
            user,
            {
              ...rest,
              networkConfig: {
                api: networkConfig.api,
                sdkExceptionUrl: networkConfig.sdkExceptionUrl,
              },
            },
          ]);
          clients.push(this);
        }
        on(name: string, fn: Function) {
          trace.push(["on", name]);
          if (!this.handlers.has(name)) this.handlers.set(name, new Set());
          this.handlers.get(name)!.add(fn);
        }
        off(name: string, fn: Function) {
          trace.push(["off", name]);
          this.handlers.get(name)?.delete(fn);
        }
        emit(name: string, value: unknown = {}) {
          for (const fn of [...(this.handlers.get(name) ?? [])]) fn(value);
        }
        getContextHandle() {
          return { user: this.user };
        }
        initializeAsync(options: any) {
          trace.push(["initialize", options]);
          initializations++;
          if (mode === "init-rejects")
            return Promise.reject(Error("initialize"));
          this.loadingStatus = "Ready";
          return Promise.resolve({ success: mode !== "init-unsuccessful" });
        }
        refreshValuesAsync(options: any) {
          trace.push(["refresh", options]);
          return Promise.resolve({ success: true });
        }
        updateUserSync(user: any, options: any) {
          trace.push(["update-sync", user, options]);
          this.user = user;
          return { success: mode !== "sync-update-fails" };
        }
        updateUserAsync(user: any, options: any) {
          trace.push(["update-async", user, options]);
          this.user = user;
          return Promise.resolve({ success: true });
        }
        checkGate(name: string) {
          trace.push(["gate", name]);
          this.emit("gate_evaluation");
          return true;
        }
        getDynamicConfig(name: string) {
          trace.push(["config", name]);
          this.emit("dynamic_config_evaluation");
          return { name };
        }
        logEvent(name: string, value: unknown, metadata: any) {
          trace.push(["log", name, value, metadata]);
          if (mode === "log-fails") throw Error("log");
          this.events.push({ eventName: name, metadata });
        }
        async flush() {
          trace.push("flush");
          this.flushes++;
          if (
            mode === "flush-missing" ||
            (mode === "flush-twice" && this.flushes === 1)
          )
            return;
          this.emit("logs_flushed", { events: this.events });
          this.events = [];
        }
      }
      const warn = (value: string) => {
        trace.push(["warn", value]);
      };
      const crypto: any = { randomUUID: () => "fixture-uuid" };
      const source = upstream
        ? extensionBindings(names, {
            chrome,
            crypto,
            Pr: readAuth,
            Rr: () => "prod",
            Ym: "chrome",
            xr: undefined,
            Re: undefined,
            Fe: undefined,
            tl: Promise.resolve(),
            Zc: { StatsigClient: Client, LogLevel: { None: 0 } },
            em: "fixture-key",
            Lc: "https://fixture.invalid/v1",
            fetch: () => {
              throw Error("unexpected network");
            },
            console: { warn },
          })
        : undefined;
      const api = upstream
        ? {
            reportMetric: source.Un,
            bufferMetric: source.Yt,
            refreshAuth: source.Mr,
            checkGate: source.Is,
            getDynamicConfig: source.Qm,
            subscribeGate: source.As,
          }
        : createExtensionFeatureService({
            chrome,
            crypto,
            readAuth,
            buildChannel: () => "prod",
            browserFamily: "chrome",
            sdkKey: "fixture-key",
            api: "https://fixture.invalid/v1",
            fetch: (() => {
              throw Error("unexpected network");
            }) as any,
            warn,
            Client: Client as any,
          });
      async function run(name: string, fn: () => any) {
        try {
          const value = await fn();
          trace.push([
            "result",
            name,
            typeof value === "function" ? "function" : value,
          ]);
          return value;
        } catch (error) {
          trace.push(["error", name, (error as Error).message]);
        }
      }
      api.bufferMetric("before", 1, {});
      await run("metric", () =>
        api.reportMetric("event", 1, { browser_family: "wrong" }),
      );
      userId = "u2";
      await run("sync-change", () => api.reportMetric("event2", "text", {}));
      await run("auth", () => api.refreshAuth());
      await run("auth-retry", () => api.refreshAuth());
      userId = "u3";
      await run("async-change", () => api.refreshAuth());
      const controller = new AbortController();
      if (mode === "pre-aborted") controller.abort();
      const stop = await run("subscribe", () =>
        api.subscribeGate(
          "enabled",
          (...args: unknown[]) => trace.push(["publish", ...args]),
          controller.signal,
        ),
      );
      for (const client of clients) client.emit("values_updated");
      controller.abort();
      if (stop) stop();
      for (const client of clients) client.emit("values_updated");
      await run("gate", () => api.checkGate("enabled"));
      await run("config", () => api.getDynamicConfig("config"));
      api.bufferMetric("buffer", 1, {});
      await flush();
      outputs.push({ trace, initializations });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
test("public Statsig 3.33.4 lacks the installed extension live-refresh API", () => {
  const require = createRequire(
    new URL("../packages/browser-extension/package.json", import.meta.url),
  );
  assert.equal(require("@statsig/js-client/package.json").version, "3.33.4");
  assert.equal(
    typeof require("@statsig/js-client").StatsigClient.prototype
      .refreshValuesAsync,
    "undefined",
  );
});
