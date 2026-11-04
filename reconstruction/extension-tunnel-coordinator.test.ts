import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { startTunnelCoordinator } from "../packages/browser-extension/src/tunnel_coordinator";
function event() {
  const listeners = new Set<Function>();
  return {
    addListener(fn: Function, _filter?: unknown) {
      listeners.add(fn);
    },
    removeListener(fn: Function) {
      listeners.delete(fn);
    },
    emit(value: unknown) {
      for (const fn of [...listeners]) fn(value);
    },
    listeners,
  };
}
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
test("setup coordinator matches original refresh, recovery, cooldown, health and cleanup ordering", async () => {
  for (const mode of [
    "normal",
    "failed",
    "http403",
    "http503",
    "invalid-session",
    "throw",
    "account-change",
    "same-token",
    "navigation",
    "health-timeout",
  ]) {
    async function scenario(original: boolean) {
      const trace: unknown[] = [];
      let now = 1000,
        calls = 0,
        timerId = 0;
      const timers = new Map<number, Function>();
      const config = {
        account: { userId: "u", id: "a", structure: "personal" },
        baseUrl: "https://fixture.invalid",
        tunnelId: "id",
        apiKey: "old-fixture",
      };
      let stored: any = {
        ...config,
        apiKey: mode === "same-token" ? config.apiKey : "new-fixture",
      };
      if (mode === "account-change")
        stored = { ...stored, account: { ...config.account, id: "different" } };
      if (["failed", "http403", "http503"].includes(mode)) stored = null;
      let invalid!: Function,
        recover!: Function,
        activityCallbacks: any,
        activeSignal: AbortSignal | undefined;
      const alarms = event(),
        navigation = event();
      const chrome: any = {
        webNavigation: { onCompleted: navigation },
        alarms: {
          onAlarm: alarms,
          async create(name: string, value: unknown) {
            trace.push(["alarm-create", name, value]);
          },
          async clear(name: string) {
            trace.push(["alarm-clear", name]);
            return true;
          },
        },
        storage: {
          session: {
            async remove(key: string) {
              trace.push(["remove", key]);
            },
          },
        },
      };
      const setup = async (details: any, signal: AbortSignal, id?: string) => {
        calls++;
        trace.push(["setup", details.trigger, id]);
        details.stage = "configure";
        if (mode === "health-timeout" && calls > 1) {
          activeSignal = signal;
          await new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            }),
          );
        }
        if (mode === "throw") throw Error("setup failed");
        if (mode === "http403" || mode === "http503")
          details.http_status = Number(mode.slice(4));
        if (["failed", "http403", "http503"].includes(mode)) return "failed";
        return mode === "invalid-session" ? "invalid_session" : "refreshed";
      };
      const read = async () => {
        trace.push("read");
        return stored;
      };
      const createPolling = async (
        _end: unknown,
        onInvalid: Function,
        suspended: boolean,
        onRecovery: Function,
        activity: any,
      ) => {
        invalid = onInvalid;
        recover = onRecovery;
        activityCallbacks = activity;
        trace.push(["poller-create", suspended]);
        return {
          suspend() {
            trace.push("suspend");
          },
          async resume() {
            trace.push("resume");
          },
          async setListening(value: boolean) {
            trace.push(["listening", value]);
          },
          async ensurePolling() {
            trace.push("ensure");
          },
          stop() {
            trace.push("poller-stop");
          },
        };
      };
      const createActivity = async (onListening: Function) => {
        trace.push("activity-create");
        onListening(true);
        return {
          turnStarted(id: string) {
            trace.push(["turn-start", id]);
          },
          turnEnded(id: string) {
            trace.push(["turn-end", id]);
          },
          async refresh() {
            trace.push("activity-refresh");
          },
          stop() {
            trace.push("activity-stop");
          },
        };
      };
      const report = (value: unknown) =>
        trace.push(["report", structuredClone(value)]);
      const warn = (value: string) => trace.push(["warn", value]);
      const setTimer: any = (fn: Function, delay: number) => {
        timers.set(++timerId, fn);
        trace.push(["timer", delay]);
        return timerId;
      };
      const clearTimer: any = (id: number) => {
        timers.delete(id);
        trace.push("clear-timer");
      };
      const { S_ } = extensionBindings(["S_", "m_"], {
        Ml: 30000,
        Ll: 60000,
        mt: "nodeReplTunnel",
        qn: "browser-use-tunnel-retry",
        zs: "browser-use-tunnel-health",
        Or: "https://chatgpt.com",
        Date: { now: () => now },
        setTimeout: setTimer,
        clearTimeout: clearTimer,
        chrome,
        T_: setup,
        Hn: read,
        E_: createPolling,
        w_: createActivity,
        Ur: (_event: string, value: unknown) => report(value),
        console: { warn },
      });
      const stop = await (original
        ? S_(async () => {})
        : startTunnelCoordinator(
            {
              chrome,
              now: () => now,
              setTimeout: setTimer,
              clearTimeout: clearTimer,
              warn,
              reportSetup: report,
              setup: setup as any,
              readConfiguration: read,
              createPolling: createPolling as any,
              createActivity: createActivity as any,
            },
            async () => {},
          ));
      activityCallbacks.turnStarted("turn");
      activityCallbacks.turnEnded("turn");
      alarms.emit({ name: "browser-use-tunnel-health" });
      await flush();
      if (mode === "navigation") {
        navigation.emit({ frameId: 1, url: "https://chatgpt.com/" });
        navigation.emit({ frameId: 0, url: "https://other.invalid/" });
        navigation.emit({ frameId: 0, url: "https://chatgpt.com/one" });
        navigation.emit({ frameId: 0, url: "https://chatgpt.com/two" });
        await flush();
      } else if (mode === "health-timeout") {
        const pending = invalid(config, "invalid_tunnel").catch(
          (error: Error) => trace.push(["timeout", error.message]),
        );
        await flush();
        assert.ok(activeSignal);
        now += 60000;
        alarms.emit({ name: "browser-use-tunnel-health" });
        await pending;
        assert.equal(activeSignal.aborted, true);
      } else {
        const retry = async (token: string, signal: AbortSignal) => {
          trace.push(["retry-response", token, signal.aborted]);
          return true;
        };
        trace.push(["recovery", await recover(config, retry)]);
        trace.push(["cooldown", await recover(config, retry)]);
        now += 30000;
        await invalid(config, "invalid_tunnel").catch((error: Error) =>
          trace.push(["invalid-error", error.message]),
        );
      }
      stop();
      await flush();
      assert.equal(timers.size, 0);
      assert.equal(alarms.listeners.size, 0);
      assert.equal(navigation.listeners.size, 0);
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});
