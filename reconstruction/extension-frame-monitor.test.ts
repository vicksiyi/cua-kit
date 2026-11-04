import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createForeignFrameMonitor } from "../packages/browser-extension/src/foreign_frame_monitor";
import {
  installForeignFrameMonitor,
  hasForeignFrameMonitor,
  removeForeignFrameMonitor,
} from "../packages/browser-extension/src/foreign_frame_dom";
function fixture(original: boolean) {
  const trace: any[] = [],
    listeners = new Map<string, Function[]>();
  const state = {
    frames: [
      { frameId: 0, documentId: "main", documentLifecycle: "active" },
      { frameId: 1, documentId: "child", documentLifecycle: "active" },
    ] as any,
    lease: {
      sessionId: "s",
      turnId: "t",
      claimedAt: 1,
      instanceId: "i",
    } as any,
    ping: false,
    fileResult: [] as any,
    injectionMode: "all",
    block: null as Promise<void> | null,
    queryBlock: null as Promise<void> | null,
  };
  const event = (name: string) => ({
    addListener(fn: Function) {
      trace.push(["listen", name]);
      const values = listeners.get(name) ?? [];
      values.push(fn);
      listeners.set(name, values);
    },
  });
  const leases = {
    async ensureInit() {
      trace.push(["lease-init"]);
    },
    async getActiveLease(id: number) {
      trace.push(["lease", id]);
      return state.lease;
    },
    mightHaveActiveTabLease(id: number) {
      trace.push(["maybe-lease", id]);
      return state.lease != null;
    },
    async getOwningSessionId(id: number) {
      trace.push(["owner", id]);
      return state.lease?.sessionId;
    },
  };
  const originalInstall = function jy() {};
  let bindings: any;
  const chrome: any = {
    tabs: {
      onUpdated: event("updated"),
      onRemoved: event("removed"),
      onReplaced: event("replaced"),
    },
    webNavigation: {
      onCommitted: event("committed"),
      async getAllFrames(options: any) {
        trace.push(["frames", options]);
        if (state.queryBlock) await state.queryBlock;
        if (state.frames === "throw") throw Error("no frames");
        return state.frames;
      },
    },
    debugger: { onDetach: event("detached") },
    scripting: {
      async executeScript(options: any) {
        const kind = options.files
          ? "file"
          : options.func === originalInstall ||
              options.func === installForeignFrameMonitor
            ? "install"
            : options.func === hasForeignFrameMonitor ||
                options.func === bindings?.Xy
              ? "ping"
              : "remove";
        trace.push([
          "execute",
          kind,
          { ...options, func: options.func ? kind : undefined },
        ]);
        if ((kind === "install" || kind === "file") && state.block)
          await state.block;
        if (kind === "ping") return [{ result: state.ping }];
        if (kind === "file") return state.fileResult;
        if (kind === "install") {
          if (state.injectionMode === "throw") throw Error("inject failed");
          return options.target.documentIds.map(
            (documentId: string, i: number) => ({
              documentId,
              result: state.injectionMode === "all" || i === 0,
            }),
          );
        }
        return [{ result: undefined }];
      },
    },
  };
  const content: any = {
    withTimeout: async (operation: Promise<any>) => {
      trace.push(["bounded"]);
      return operation;
    },
  };
  bindings = original
    ? extensionBindings(
        [
          "be",
          "at",
          "ot",
          "di",
          "qy",
          "Hy",
          "Gy",
          "ju",
          "zy",
          "Aa",
          "Vr",
          "Vy",
          "Ca",
          "ka",
          "Wy",
          "Ky",
          "Zy",
          "Jy",
          "Xy",
          "Yy",
          "Qy",
          "eS",
          "qu",
          "tS",
        ],
        {
          chrome,
          st: { getInstance: () => leases },
          de: content.withTimeout,
          navigator: { userAgent: "fixture" },
          Jt: () => "chrome",
          Cn: (_family: string, url: string | undefined) =>
            url?.startsWith("chrome://"),
          Ia: "__codexForeignExtensionFrameMonitor",
          jy: originalInstall,
          Fu: false,
          Bu: false,
        },
      )
    : null;
  const api = original
    ? {
        initialize: bindings.qy,
        initializeReplacements: bindings.Hy,
        track: bindings.Gy,
        ensure: bindings.ju,
        remove: bindings.zy,
        invalidate: bindings.ka,
        handleUpdated: bindings.Yy,
        handleReplaced: bindings.Qy,
        handleRemoved: bindings.eS,
        cleanup: bindings.qu,
      }
    : createForeignFrameMonitor({
        chrome,
        tabLeases: { getInstance: () => leases },
        isInternalUrl: (url) => url?.startsWith("chrome://") ?? false,
        contentRuntime: content,
      });
  return { api, state, trace, listeners };
}
test("foreign-frame lifecycle matches original document caching, fallback, leases and browser events", async () => {
  const run = async (original: boolean) => {
    const { api, state, trace, listeners } = fixture(original),
      results: any[] = [];
    api.initializeReplacements();
    api.initialize();
    api.initialize();
    results.push(await api.ensure(1));
    api.track(1);
    results.push(await Promise.all([api.ensure(1), api.ensure(1)]));
    results.push(await api.ensure(1));
    state.frames = [
      { frameId: 0, documentId: "main", documentLifecycle: "active" },
      { frameId: 2, documentId: "next", documentLifecycle: "active" },
    ];
    listeners.get("committed")![0]({ tabId: 1, frameId: 2 });
    results.push(await api.ensure(1));
    listeners.get("detached")![0]({ tabId: 1 });
    results.push(await api.ensure(1));
    state.lease = { ...state.lease, turnId: "next" };
    results.push(await api.ensure(1));
    state.frames = null;
    api.invalidate(1);
    results.push(await api.ensure(1));
    state.frames = "throw";
    state.ping = true;
    results.push(await api.ensure(1));
    state.frames = [
      { frameId: 1, documentId: "orphan", documentLifecycle: "active" },
    ];
    state.ping = false;
    state.fileResult = null;
    results.push(await api.ensure(1));
    state.frames = [
      { frameId: 0, documentId: "fresh", documentLifecycle: "active" },
      { frameId: 1, documentId: "fresh-child", documentLifecycle: "active" },
    ];
    state.injectionMode = "partial";
    state.fileResult = [];
    results.push(await api.ensure(1));
    api.handleUpdated(1, { status: "complete" }, {
      url: "https://site.test",
    } as any);
    api.handleUpdated(1, { status: "loading" }, {
      url: "chrome://settings",
    } as any);
    state.injectionMode = "all";
    api.handleUpdated(1, { status: "loading" }, {
      url: "https://site.test",
    } as any);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    api.handleReplaced(2, 1);
    results.push(await api.ensure(1), await api.ensure(2));
    api.handleRemoved(2);
    results.push(await api.ensure(2));
    await api.remove(1);
    state.lease = null;
    api.track(3);
    results.push(await api.ensure(3));
    return { results, trace };
  };
  const actual = await run(false);
  assert.deepEqual(actual, await run(true));
  assert.equal(actual.results[0], false);
  assert.deepEqual(actual.results[1], [true, true]);
  assert.ok(
    actual.trace.some((row) => row[0] === "execute" && row[1] === "file"),
  );
});
test("foreign-frame cleanup waits for in-flight injections and preserves re-tracked tabs", async () => {
  const run = async (
    original: boolean,
    retrack: boolean,
    fallback: boolean,
    beforeQuery: boolean,
  ) => {
    const { api, state, trace } = fixture(original);
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    if (beforeQuery) state.queryBlock = gate;
    else state.block = gate;
    if (fallback) state.frames = null;
    api.track(1);
    const installing = api.ensure(1);
    for (let i = 0; i < 20; i++) await Promise.resolve();
    let removed = false;
    const removal = api.remove(1).then(() => {
      removed = true;
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const removedBeforeInjectionFinished = removed;
    if (retrack) api.track(1);
    unblock();
    const result = await installing;
    await removal;
    return { trace, result, removedBeforeInjectionFinished };
  };
  for (const retrack of [false, true])
    for (const fallback of [false, true])
      for (const beforeQuery of [false, true]) {
        const actual = await run(false, retrack, fallback, beforeQuery);
        assert.deepEqual(
          actual,
          await run(true, retrack, fallback, beforeQuery),
        );
        if (!beforeQuery)
          assert.equal(actual.removedBeforeInjectionFinished, false);
        if (!retrack) assert.equal(actual.result, false);
      }
});
