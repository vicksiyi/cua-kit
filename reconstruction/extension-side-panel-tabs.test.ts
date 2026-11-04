import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createSidePanelTabController } from "../packages/browser-extension/src/side_panel_tabs";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(upstream: boolean, edge = false) {
  const trace: any[] = [],
    listeners = new Map<string, Set<Function>>();
  const state = {
    stored: [1, 0, -1, 1.5, "2", 2],
    failRead: false,
    failWrite: false,
    failOptions: false,
    defaults: { enabled: true, path: "old" },
    gate: undefined as Promise<void> | undefined,
  };
  const event = (name: string) => ({
    addListener(fn: Function) {
      trace.push(["add", name]);
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeListener(fn: Function) {
      trace.push(["remove", name]);
      listeners.get(name)?.delete(fn);
    },
  });
  const chrome: any = {
    tabs: {
      onActivated: event("activated"),
      onCreated: event("created"),
      onRemoved: event("removed"),
      async query(options: any) {
        trace.push(["query", options]);
        return [{ id: 1 }, { id: 3 }, {}];
      },
    },
    storage: {
      session: {
        async get(key: string) {
          trace.push(["get", key]);
          await state.gate;
          if (state.failRead) throw Error("read");
          return { [key]: state.stored };
        },
        async set(value: any) {
          trace.push(["set", value]);
          if (state.failWrite) throw Error("write");
        },
        async remove(value: any) {
          trace.push(["remove-storage", value]);
        },
      },
    },
    sidePanel: {
      async getOptions(options: any) {
        trace.push(["getOptions", options]);
        return state.defaults;
      },
      async setOptions(options: any) {
        trace.push(["setOptions", options]);
        if (state.failOptions) throw Error("options");
      },
      async setPanelBehavior(options: any) {
        trace.push(["behavior", options]);
      },
    },
  };
  const warn = (message: string) => trace.push(["warn", message]);
  const source = upstream
    ? extensionBindings(
        [
          "_r",
          "Uo",
          "br",
          "Ki",
          "bk",
          "Mf",
          "Sk",
          "Df",
          "Ek",
          "Tk",
          "Ik",
          "Ak",
          "$o",
          "Fo",
          "Ck",
          "Nf",
          "kk",
        ],
        {
          chrome,
          vr: () => edge,
          console: { warn },
          Lf: undefined,
          pn: undefined,
        },
      )
    : null;
  const api = upstream
    ? {
        enableTemporarily: source.Sk,
        setPersistent: source.Df,
        refreshTab: source.$o,
        removeTab: source.kk,
        initialize: source.Tk,
        register: source.Ek,
      }
    : createSidePanelTabController({ chrome, isEdge: () => edge, warn });
  return {
    api,
    state,
    trace,
    fire(name: string, value: any) {
      for (const listener of listeners.get(name) ?? []) listener(value);
    },
  };
}
test("side panel destination matches original persistent/temporary state and Edge behavior", async () => {
  for (const edge of [false, true]) {
    const results = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream, edge);
      await f.api.initialize();
      await f.api.enableTemporarily(3);
      await f.api.refreshTab(3);
      await f.api.setPersistent(3, true);
      await f.api.refreshTab(3);
      await f.api.setPersistent(1, false);
      await f.api.refreshTab(1);
      await f.api.removeTab(2);
      await f.api.removeTab(3);
      await f.api.refreshTab(3);
      results.push(f.trace);
    }
    assert.deepEqual(results[1], results[0]);
  }
});
test("side panel registration is shared and event cleanup/re-registration matches original", async () => {
  const results = [];
  for (const upstream of [true, false]) {
    const f = fixture(upstream);
    const stop = f.api.register();
    assert.equal(f.api.register(), stop);
    await flush();
    f.fire("activated", { tabId: 2 });
    f.fire("created", {});
    f.fire("created", { id: 8 });
    await flush();
    f.fire("removed", 2);
    await flush();
    stop();
    f.fire("activated", { tabId: 3 });
    const again = f.api.register();
    await flush();
    again();
    results.push(f.trace);
  }
  assert.deepEqual(results[1], results[0]);
});
test("side panel restoration failures remain cached, concurrent reads coalesce and failures retain mutation ordering", async () => {
  for (const mode of [
    "read-fail",
    "write-fail",
    "options-fail",
    "concurrent",
  ]) {
    const results = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream);
      f.state.failRead = mode === "read-fail";
      f.state.failWrite = mode === "write-fail";
      f.state.failOptions = mode === "options-fail";
      const outcome = async (p: Promise<any>) => {
        try {
          await p;
          return "ok";
        } catch (error) {
          return (error as Error).message;
        }
      };
      let release!: () => void;
      if (mode === "concurrent")
        f.state.gate = new Promise((resolve) => {
          release = resolve;
        });
      const a = outcome(f.api.refreshTab(1)),
        b = outcome(f.api.refreshTab(2));
      if (mode === "concurrent") {
        await flush();
        assert.equal(f.trace.filter((row) => row[0] === "get").length, 1);
        release();
      }
      const first = await Promise.all([a, b]);
      const result = await outcome(f.api.setPersistent(4, true));
      f.state.failRead = f.state.failWrite = f.state.failOptions = false;
      await f.api.refreshTab(4);
      await f.api.refreshTab(1);
      results.push({ first, result, trace: f.trace });
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});
