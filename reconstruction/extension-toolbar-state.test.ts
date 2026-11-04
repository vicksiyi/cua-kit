import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createToolbarStateReporter } from "../packages/browser-extension/src/toolbar_state";
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("toolbar state matches original daily/update suppression, changed snapshots and queued failures", async () => {
  for (const mode of [
    "normal",
    "same-day",
    "old-day",
    "string",
    "read-fails",
    "metric-fails",
    "settings-fails",
    "write-fails",
    "alarm-fails",
    "existing-alarm",
    "no-change-event",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        alarms: Function[] = [],
        changes: Function[] = [];
      let now = 4 * 86400000 + 50;
      let stored: unknown =
        mode === "same-day"
          ? now - 10
          : mode === "old-day"
            ? 2
            : mode === "string"
              ? "2"
              : undefined;
      let failed = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let firstRead = true;
      async function call(kind: string, arg?: unknown) {
        trace.push([kind, arg]);
        if (kind === "read" && firstRead) {
          firstRead = false;
          await gate;
        }
        if (!failed && mode === `${kind}-fails`) {
          failed = true;
          throw Error(mode);
        }
      }
      const chrome: any = {
        action: {
          onUserSettingsChanged:
            mode === "no-change-event"
              ? undefined
              : {
                  addListener(fn: Function) {
                    changes.push(fn);
                    trace.push("change-listener");
                  },
                },
          async getUserSettings() {
            await call("settings");
            return { isOnToolbar: true };
          },
        },
        alarms: {
          onAlarm: {
            addListener(fn: Function) {
              alarms.push(fn);
              trace.push("alarm-listener");
            },
          },
          async get(name: string) {
            await call("alarm", name);
            return mode === "existing-alarm" ? {} : undefined;
          },
          async create(...args: unknown[]) {
            await call("create", args);
          },
        },
        storage: {
          local: {
            async get(keys: string[]) {
              await call("read", keys);
              return { [keys[0]]: stored };
            },
            async set(value: any) {
              await call("write", value);
              stored = value.codexToolbarStateLastSnapshot;
            },
          },
        },
      };
      const reportMetric = (...args: unknown[]) => call("metric", args);
      const warn = (message: string) => {
        trace.push(["warn", message]);
      };
      const source = upstream
        ? extensionBindings(["jo", "Bk", "qo", "zf", "jk", "Xi", "qk"], {
            chrome,
            Date: { now: () => now },
            Un: reportMetric,
            console: { warn },
            Vf: Promise.resolve(),
          })
        : undefined;
      const api = upstream
        ? { register: source.jk, report: source.Xi }
        : createToolbarStateReporter({
            chrome,
            now: () => now,
            reportMetric,
            warn,
          });
      api.register();
      api.report("update");
      api.report("startup");
      for (const listener of changes) {
        listener({});
        listener({ isOnToolbar: false });
      }
      alarms[0]({ name: "other" });
      alarms[0]({ name: "codex-toolbar-state-alarm" });
      await flush();
      assert.equal(trace.filter((e) => e[0] === "read").length, 1);
      release();
      await flush();
      now += 86400000;
      api.report("alarm");
      api.report("install", false);
      api.report("startup");
      await flush();
      outputs.push({ trace, stored });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
