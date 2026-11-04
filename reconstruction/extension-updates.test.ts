import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createExtensionUpdateManagerClass } from "../packages/browser-extension/src/extension_updates";
const key = "codexPendingUpdateVersion";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(upstream: boolean) {
  const trace: any[] = [],
    listeners: Function[] = [];
  const state = {
    stored: undefined as any,
    busy: false,
    fail: "",
    gate: undefined as Promise<void> | undefined,
  };
  const storage: any = {
    async get(name: string) {
      trace.push(["get", name]);
      const captured = state.stored;
      await state.gate;
      if (state.fail === "get") throw Error("get failed");
      return { [key]: captured };
    },
    async set(value: any) {
      trace.push(["set", value]);
      if (state.fail === "set") throw Error("set failed");
      state.stored = value[key];
    },
    async remove(name: string) {
      trace.push(["remove", name]);
      if (state.fail === "remove") throw Error("remove failed");
      state.stored = undefined;
    },
  };
  const chrome: any = {
    runtime: {
      onUpdateAvailable: {
        addListener(fn: Function) {
          trace.push(["listen"]);
          listeners.push(fn);
        },
      },
      getManifest() {
        trace.push(["manifest"]);
        return { version: "installed" };
      },
      reload() {
        trace.push(["reload"]);
        if (state.fail === "reload") throw Error("reload failed");
      },
    },
    storage: { session: storage },
  };
  const Class = upstream
    ? extensionBindings(["fn", "_k"], { chrome })._k
    : createExtensionUpdateManagerClass(chrome);
  const manager = new Class(() => {
    trace.push(["busy", state.busy]);
    return state.busy;
  });
  const snapshot = () => ({
    pending: manager.pendingUpdateVersion,
    reloading: manager.reloadInProgress,
    stored: state.stored,
  });
  return { trace, state, listeners, manager, snapshot, Class };
}
const outcome = async (operation: Promise<unknown>) => {
  try {
    await operation;
    return "ok";
  } catch (error) {
    return (error as Error).message;
  }
};
test("update manager preserves stored version restoration, active control deferral and reload", async () => {
  for (const stored of [undefined, 3, "installed", "next", ""]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream);
      f.state.stored = stored;
      f.state.busy = true;
      f.manager.register();
      await flush();
      const busy = f.snapshot();
      f.state.busy = false;
      await f.manager.maybeReloadForPendingUpdate();
      await f.manager.maybeReloadForPendingUpdate();
      outputs.push({ trace: f.trace, busy, final: f.snapshot() });
    }
    assert.deepEqual(outputs[1], outputs[0]);
  }
});
test("update manager preserves write/remove/reload failures and registration error suppression", async () => {
  for (const fail of ["get", "set", "remove", "reload"]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream);
      f.state.fail = fail;
      f.state.stored = "next";
      const error = await outcome(
        f.manager.handleUpdateAvailable({ version: "new" }),
      );
      const failed = f.snapshot();
      f.manager.register();
      await flush();
      await f.listeners[0]({ version: "newer" });
      f.state.fail = "";
      await f.manager.maybeReloadForPendingUpdate();
      outputs.push({ error, failed, final: f.snapshot(), trace: f.trace });
    }
    assert.deepEqual(outputs[1], outputs[0], fail);
  }
});
test("concurrent pending-version restoration retains original race and constructor overrides", async () => {
  const outputs = [];
  for (const upstream of [true, false]) {
    const f = fixture(upstream);
    f.state.stored = "next";
    let release!: () => void;
    f.state.gate = new Promise((resolve) => {
      release = resolve;
    });
    const a = f.manager.maybeReloadForPendingUpdate(),
      b = f.manager.maybeReloadForPendingUpdate();
    await flush();
    release();
    await Promise.all([a, b]);
    const override = new f.Class(() => false, {
      currentVersion: "override",
      onUpdateAvailable: { addListener() {} },
      reload() {},
      storage: {
        async get() {
          return { [key]: "override" };
        },
        async remove() {},
        async set() {},
      },
    });
    await override.maybeReloadForPendingUpdate();
    outputs.push({
      trace: f.trace,
      final: f.snapshot(),
      overrideVersion: override.installedVersion,
      overridePending: override.pendingUpdateVersion,
    });
  }
  assert.deepEqual(outputs[1], outputs[0]);
});
