import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createBrowserPluginInstallation } from "../packages/browser-extension/src/plugin_installation_service";
import { createBrowserPluginCache } from "../packages/browser-extension/src/plugin_installation";
import { ChatApiHttpError } from "../packages/browser-extension/src/chat_api";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const names = [
  "Wi",
  "Lo",
  "ek",
  "tk",
  "rk",
  "Vi",
  "ln",
  "XC",
  "YC",
  "un",
  "QC",
  "Af",
  "Mo",
  "JC",
];
test("plugin installation service matches original gate, auth, retry, account changes and stop", async () => {
  for (const mode of [
    "normal",
    "negative",
    "signed-out",
    "unauthorized",
    "decode",
    "retry",
    "nonretryable",
    "retry-after",
    "huge-delay",
    "gate-disabled",
    "gate-fails",
    "auth-refresh-fails",
    "pending-switch",
    "pending-stop",
    "callback-throws",
    "callback-rejects",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        gates: Function[] = [];
      let now = 1000,
        timerId = 0,
        apiId = 0,
        user = "u1",
        attempts = 0;
      const timers = new Map<number, { fn: Function; ms: number }>();
      const data: any = {};
      const storage: any = {
        async get(keys: unknown) {
          trace.push(["get", keys]);
          return structuredClone(data);
        },
        async set(value: any) {
          trace.push(["set", structuredClone(value)]);
          Object.assign(data, value);
        },
        async remove(keys: any) {
          trace.push(["remove", keys]);
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete data[key];
        },
      };
      const setTimeout = ((fn: Function, ms: number) => {
        const id = ++timerId;
        timers.set(id, { fn, ms });
        trace.push(["timer", id, ms]);
        return id;
      }) as any;
      const clearTimeout = ((id: number) => {
        trace.push(["clear", id]);
        timers.delete(id);
      }) as any;
      const signals: AbortSignal[] = [];
      const createAuthReader = () => {
        trace.push("new-reader");
        return async (signal?: AbortSignal) => {
          trace.push(["auth", user]);
          if (signal) {
            signals.push(signal);
            signal.addEventListener("abort", () => trace.push("auth-abort"), {
              once: true,
            });
          }
          if (mode === "signed-out") return { status: 200, session: null };
          if (mode === "unauthorized") return { status: 401, error: "http" };
          if (mode === "decode") return { status: 200, error: "decode" };
          return {
            status: 200,
            session: {
              accessToken: "fixture-token",
              account: { userId: user, id: "account", structure: "personal" },
            },
          };
        };
      };
      const refreshAuth = async (_reader: unknown, signal: AbortSignal) => {
        trace.push("refresh-auth");
        signals.push(signal);
        signal.addEventListener("abort", () => trace.push("gate-abort"), {
          once: true,
        });
        if (mode === "auth-refresh-fails") throw Error("auth-refresh");
      };
      const subscribeGate = async (
        name: string,
        listener: Function,
        _signal: AbortSignal,
      ) => {
        trace.push(["gate", name]);
        gates.push(listener);
        if (mode === "gate-fails") throw Error("gate");
        listener(mode !== "gate-disabled", "Ready", user);
      };
      let resolvePending: (() => void) | undefined;
      class Api {
        id = ++apiId;
        constructor(
          _token: string,
          public account: any,
        ) {
          trace.push(["api", this.id, account.userId]);
        }
        async request(path: string, options: any) {
          trace.push(["request", this.id, path, structuredClone(options)]);
          if (path.includes("canonical-app")) {
            attempts++;
            if (mode === "pending-switch" || mode === "pending-stop") {
              if (attempts === 1)
                await new Promise<void>((resolve) => {
                  resolvePending = resolve;
                });
            }
            if (mode === "retry") throw Error("transient");
            if (mode === "nonretryable") throw new ChatApiHttpError(400);
            if (mode === "retry-after") throw new ChatApiHttpError(429, 5000);
            if (mode === "huge-delay")
              throw new ChatApiHttpError(503, 2147483648);
            return {
              plugin_id: "plugin",
              plugin: { id: "plugin", status: "ENABLED" },
            };
          }
          return { enabled: mode !== "negative" };
        }
        dispose() {
          trace.push(["dispose", this.id]);
        }
      }
      const onInstalled = () => {
        trace.push("installed");
        if (mode === "callback-throws") throw Error("callback");
        return mode === "callback-rejects"
          ? Promise.reject(Error("callback"))
          : Promise.resolve();
      };
      const warn = (message: string) => {
        trace.push(["warn", message]);
      };
      const source = upstream
        ? extensionBindings(names, {
            chrome: { storage: { session: storage } },
            Date: { now: () => now },
            Math: { max: Math.max, floor: Math.floor, random: () => 0.25 },
            setTimeout,
            clearTimeout,
            Xc: createAuthReader,
            Mr: refreshAuth,
            As: subscribeGate,
            Dn: ChatApiHttpError,
            Yc: Api,
            console: { warn },
          })
        : undefined;
      const service = upstream
        ? source.rk(onInstalled)
        : createBrowserPluginInstallation(
            {
              cache: createBrowserPluginCache({ storage, now: () => now }),
              ChatApi: Api as any,
              createAuthReader: createAuthReader as any,
              refreshAuth,
              subscribeGate,
              now: () => now,
              random: () => 0.25,
              setTimeout,
              clearTimeout,
              warn,
            },
            onInstalled,
          );
      service.refresh();
      service.refresh();
      await flush();
      if (mode === "pending-stop") service.stop();
      if (mode === "pending-switch") {
        user = "u2";
        service.refresh();
        await flush();
      }
      resolvePending?.();
      await flush();
      service.refresh();
      await flush();
      for (let round = 0; round < 2; round++) {
        const entries = [...timers.entries()];
        for (const [id, timer] of entries) {
          timers.delete(id);
          now += timer.ms;
          trace.push(["fire", id]);
          timer.fn();
        }
        await flush();
      }
      for (const gate of [...gates]) {
        gate(false, "Ready", user);
        gate(true, "Ready", user);
      }
      await flush();
      user = "u3";
      service.refresh();
      await flush();
      for (const gate of [...gates]) gate(true, "Ready", "stale-user");
      await flush();
      service.stop();
      service.refresh();
      for (const gate of gates) gate(true, "Ready", user);
      await flush();
      outputs.push({
        trace,
        data,
        timers: [...timers.values()].map((v) => v.ms),
        aborted: signals.map((signal) => signal.aborted),
      });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
