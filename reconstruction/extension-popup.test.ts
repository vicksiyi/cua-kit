import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings, extensionFunctionCalls } from "./extension-source";
import {
  createPopupInterceptor,
  createPopupMessageHandler,
  isAgentPopupRequest,
} from "../packages/browser-extension/src/popup_interceptor";
const key = "__codexAgentPopupInterceptor",
  eventName = "__codexAgentBackgroundPopupRequest";
function fixture(original: boolean) {
  const trace: any[] = [],
    listeners = new Map<string, Function[]>();
  const state = {
    present: [] as any,
    bridge: [] as any,
    main: [] as any,
    fail: "",
    block: null as Promise<void> | null,
    blockAt: "bridge",
    lease: {} as any,
  };
  const event = (name: string) => ({
    addListener(fn: Function) {
      trace.push(["listen", name]);
      const list = listeners.get(name) ?? [];
      list.push(fn);
      listeners.set(name, list);
    },
  });
  const chrome: any = {
    tabs: { onRemoved: event("removed"), onReplaced: event("replaced") },
    webNavigation: { onCommitted: event("committed") },
    scripting: {
      async executeScript(options: any) {
        const names: Record<string, string> = {
          Ny: "ping",
          hasPopupInterceptor: "ping",
          Uy: "bridge",
          installPopupBridge: "bridge",
          $y: "main",
          installPopupInterceptor: "main",
          Fy: "remove-main",
          removePopupInterceptor: "remove-main",
          By: "remove-bridge",
          removePopupBridge: "remove-bridge",
        };
        const kind = names[options.func.name];
        trace.push(["execute", kind, { ...options, func: kind }]);
        if (state.block && kind === state.blockAt) await state.block;
        if (kind === state.fail) throw Error("injection error");
        return kind === "ping"
          ? state.present
          : kind === "bridge"
            ? state.bridge
            : kind === "main"
              ? state.main
              : [];
      },
    },
  };
  const leases = {
    mightHaveActiveTabLease(id: number) {
      trace.push(["maybe", id]);
      return state.lease != null;
    },
    async getActiveLease(id: number) {
      trace.push(["lease", id]);
      return state.lease;
    },
  };
  const content: any = {
    async withTimeout(operation: Promise<any>) {
      trace.push(["bounded"]);
      return operation;
    },
  };
  const bindings = original
    ? extensionBindings(
        [
          "De",
          "vt",
          "Cy",
          "ky",
          "$u",
          "Ry",
          "Py",
          "xy",
          "My",
          "Ly",
          "Dy",
          "Ny",
          "Uy",
          "$y",
          "Fy",
          "By",
        ],
        {
          chrome,
          st: { getInstance: () => leases },
          de: content.withTimeout,
          zr: key,
          Nu: eventName,
          Uu: false,
        },
      )
    : null;
  const api = original
    ? {
        initialize: bindings.Cy,
        track: bindings.ky,
        ensure: bindings.$u,
        remove: bindings.Ry,
        inject: bindings.Py,
        handleCommitted: bindings.xy,
        refresh: bindings.My,
        handleReplaced: bindings.Ly,
        handleRemoved: bindings.Dy,
      }
    : createPopupInterceptor({
        chrome,
        tabLeases: { getInstance: () => leases },
        contentRuntime: content,
      });
  return { api, state, trace, listeners };
}
test("popup lifecycle matches original world ordering, acknowledgement rules, navigation and failures", async () => {
  const run = async (original: boolean) => {
    const { api, state, trace, listeners } = fixture(original),
      results: any[] = [];
    api.initialize();
    api.initialize();
    results.push(await api.ensure(1));
    await api.remove(1);
    api.track(1);
    results.push(await Promise.all([api.ensure(1), api.ensure(1)]));
    state.present = [{ result: true }];
    results.push(await api.ensure(1));
    state.present = [{ result: true }, { result: false }];
    state.bridge = null;
    results.push(await api.ensure(1));
    state.bridge = [];
    state.main = null;
    results.push(await api.ensure(1));
    state.main = [];
    state.fail = "main";
    results.push(await api.ensure(1));
    state.fail = "";
    listeners.get("committed")![0]({ tabId: 1 });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    api.handleReplaced(2, 1);
    results.push(await api.ensure(1), await api.ensure(2));
    await api.remove(2);
    await api.remove(2);
    api.track(3);
    api.handleRemoved(3);
    results.push(await api.ensure(3));
    state.lease = null;
    api.track(4);
    api.refresh(4);
    return { results, trace };
  };
  const actual = await run(false);
  assert.deepEqual(actual, await run(true));
  assert.deepEqual(actual.results.slice(0, 3), [false, [true, true], true]);
  assert.deepEqual(
    actual.trace
      .filter((row) => row[0] === "execute")
      .slice(0, 3)
      .map((row) => [row[1], row[2].world]),
    [
      ["ping", "MAIN"],
      ["bridge", undefined],
      ["main", "MAIN"],
    ],
  );
});
test("popup removal waits for injection and retains original cleanup even if re-tracked", async () => {
  const run = async (original: boolean, phase: string, retrack: boolean) => {
    const { api, state, trace } = fixture(original);
    let release!: () => void;
    state.blockAt = phase;
    state.block = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.track(1);
    const installing = api.ensure(1);
    for (let i = 0; i < 15; i++) await Promise.resolve();
    let removed = false;
    const removing = api.remove(1).then(() => {
      removed = true;
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const before = removed;
    if (retrack) api.track(1);
    release();
    const installed = await installing;
    await removing;
    return { trace, before, installed };
  };
  for (const phase of ["ping", "bridge", "main"])
    for (const retrack of [false, true]) {
      const actual = await run(false, phase, retrack);
      assert.deepEqual(actual, await run(true, phase, retrack));
      assert.equal(actual.before, false);
      assert.deepEqual(
        actual.trace
          .filter((row) => row[0] === "execute")
          .slice(-2)
          .map((row) => row[1]),
        ["remove-main", "remove-bridge"],
      );
    }
});
test("popup runtime routing matches the actual original startup listener branch", async () => {
  const guard = extensionBindings(["Oy"], {}).Oy;
  for (const value of [
    null,
    false,
    {},
    [],
    { type: "CODEX_OPEN_AGENT_BACKGROUND_POPUP", url: "" },
    { type: "CODEX_OPEN_AGENT_BACKGROUND_POPUP", url: 1 },
  ])
    assert.equal(isAgentPopupRequest(value), guard(value));
  const run = async (original: boolean) => {
    const trace: any[] = [];
    const handler = {
      async handleAgentBackgroundPopup(tabId: number, url: string) {
        trace.push(["open", tabId, url]);
        if (url === "reject") throw Error("failed");
      },
    };
    let listener: Function;
    if (original)
      extensionFunctionCalls("dR", ["chrome.runtime.onMessage.addListener"], {
        chrome: {
          runtime: {
            onMessage: {
              addListener(fn: Function) {
                listener = fn;
              },
            },
          },
        },
        wk: () => false,
        l: () => false,
        Oy: guard,
        u: handler,
      });
    else listener = createPopupMessageHandler(handler);
    for (const url of ["https://site.test", "reject", ""])
      for (const sender of [{}, { tab: { id: 1 } }]) {
        trace.push([
          "return",
          listener!(
            { type: "CODEX_OPEN_AGENT_BACKGROUND_POPUP", url },
            sender,
            (value: any) => trace.push(["reply", value]),
          ),
        ]);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
    return trace;
  };
  assert.deepEqual(await run(false), await run(true));
});
