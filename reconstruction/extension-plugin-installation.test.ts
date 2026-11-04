import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  ensureBrowserPlugin,
  createBrowserPluginCache,
  parsePluginNegativeResult,
} from "../packages/browser-extension/src/plugin_installation";
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("browser plugin ensure matches original service gates, encoded ID and request failures", async () => {
  const original = extensionBindings(["Af", "Mo", "JC"], {});
  for (const mode of [
    "ok",
    "no-id",
    "wrong-id",
    "disabled",
    "unavailable",
    "not-enabled",
    "truthy-enabled",
    "canonical-fails",
    "ensure-fails",
    "link-fails",
    "null-response",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [];
      const api: any = {
        async request(path: string, init: any) {
          trace.push([path, structuredClone(init)]);
          if (path.includes("canonical-app")) {
            if (mode === "canonical-fails") throw Error("canonical");
            if (mode === "null-response") return null;
            return {
              plugin_id: mode === "no-id" ? null : "a/b ?",
              plugin: {
                id: mode === "wrong-id" ? "other" : "a/b ?",
                status: mode === "disabled" ? "DISABLED" : "ENABLED",
                installation_policy:
                  mode === "unavailable" ? "NOT_AVAILABLE" : "AVAILABLE",
              },
            };
          }
          if (path.endsWith("/ensure")) {
            if (mode === "ensure-fails") throw Error("ensure");
            return {
              enabled:
                mode === "not-enabled"
                  ? false
                  : mode === "truthy-enabled"
                    ? "yes"
                    : true,
            };
          }
          if (mode === "link-fails") throw Error("link");
          return {};
        },
      };
      try {
        trace.push([
          "result",
          await (upstream ? original.JC(api) : ensureBrowserPlugin(api)),
        ]);
      } catch (error) {
        trace.push([
          "error",
          (error as Error).name,
          mode === "null-response" ? "null" : (error as Error).message,
        ]);
      }
      outputs.push(trace);
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
test("browser plugin cache matches single load, expiry, independent positive/negative records and races", async () => {
  const a = { userId: "u", id: "a" },
    b = { userId: "u", id: "b" };
  for (const mode of [
    "empty",
    "complete",
    "negative",
    "expired",
    "invalid",
    "read-fails",
    "write-fails",
    "remove-fails",
    "clear-before-load",
    "record-before-load",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [];
      let now = 100;
      const data: any =
        mode === "complete"
          ? { browserPluginSetupIdentity: JSON.stringify([a.userId, a.id]) }
          : mode === "negative" || mode === "expired"
            ? {
                browserPluginSetupNegativeResult: {
                  identity: JSON.stringify([a.userId, a.id]),
                  notBeforeMs: mode === "expired" ? 100 : 101,
                },
              }
            : mode === "invalid"
              ? {
                  browserPluginSetupIdentity: 4,
                  browserPluginSetupNegativeResult: {
                    identity: "x",
                    notBeforeMs: Infinity,
                  },
                }
              : {};
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const storage: any = {
        async get(keys: unknown) {
          trace.push(["get", keys]);
          const captured = structuredClone(data);
          await gate;
          if (mode === "read-fails") throw Error("read");
          return captured;
        },
        async set(value: any) {
          trace.push(["set", structuredClone(value)]);
          if (mode === "write-fails") throw Error("write");
          Object.assign(data, value);
        },
        async remove(keys: any) {
          trace.push(["remove", keys]);
          if (mode === "remove-fails") throw Error("remove");
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete data[key];
        },
      };
      const original = upstream
        ? extensionBindings(["Vi", "ln", "XC", "YC", "un", "QC"], {
            chrome: { storage: { session: storage } },
            Date: { now: () => now },
          })
        : undefined;
      const cache = upstream
        ? original.YC()
        : createBrowserPluginCache({ storage, now: () => now });
      const snapshot = () =>
        trace.push([
          "state",
          cache.isComplete(a),
          cache.shouldSkip(a),
          cache.isComplete(b),
          cache.shouldSkip(b),
        ]);
      snapshot();
      const loading = [cache.load(), cache.load()];
      if (mode === "clear-before-load") cache.clear();
      if (mode === "record-before-load") cache.record(a, true);
      release();
      await Promise.all(loading);
      snapshot();
      cache.record(a, false);
      snapshot();
      now += 1800000;
      snapshot();
      cache.record(b, false);
      cache.record(a, true);
      snapshot();
      cache.clearNegative();
      snapshot();
      cache.record(b, false);
      cache.clear();
      snapshot();
      await cache.load();
      snapshot();
      await flush();
      outputs.push({ trace, data });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
test("plugin negative result validator retains original structural and finite-number rules", () => {
  const original = extensionBindings(["QC"], {});
  for (const value of [
    null,
    [],
    {},
    { identity: "", notBeforeMs: -1 },
    { identity: "x", notBeforeMs: NaN },
    { identity: "x", notBeforeMs: Infinity },
    Object.create({ identity: "x", notBeforeMs: 1 }),
    { identity: 1, notBeforeMs: 1 },
  ])
    assert.deepEqual(parsePluginNegativeResult(value), original.QC(value));
});
