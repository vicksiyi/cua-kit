import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createSidePanelTabController } from "../packages/browser-extension/src/side_panel_tabs";
import { createSidePanelWindowController } from "../packages/browser-extension/src/side_panel_window";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(upstream: boolean, mode: string) {
  const trace: any[] = [],
    opened: Function[] = [],
    closed: Function[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chrome: any = {
    storage: {
      session: {
        async get(key: string) {
          trace.push(["get", key]);
          return {};
        },
        async set(value: any) {
          trace.push(["set", value]);
          if (mode === "storage-fail") throw Error("storage");
        },
      },
    },
    windows: {
      async getCurrent() {
        trace.push(["current"]);
        return { id: mode === "missing-window" ? undefined : 10 };
      },
    },
    sidePanel: {
      async setOptions(options: any) {
        trace.push(["options", options]);
        if (mode === "enable-pending" && options.enabled) await gate;
        if (mode === "enable-fail" && options.enabled) throw Error("enable");
      },
      async open(target: any) {
        trace.push(["open", target]);
        if (mode === "open-fail") throw Error("open");
      },
      async close(target: any) {
        trace.push(["close", target]);
        if (mode === "close-fail") throw Error("close");
      },
      onOpened: {
        addListener(fn: Function) {
          trace.push(["listen-open"]);
          opened.push(fn);
        },
      },
      onClosed: {
        addListener(fn: Function) {
          trace.push(["listen-close"]);
          closed.push(fn);
        },
      },
    },
  };
  const edge = () => mode === "edge";
  const clear = async () => {
    trace.push(["callout"]);
    if (mode === "callout-fail") throw Error("callout");
  };
  const metric = async (...args: any[]) => {
    trace.push(["metric", ...args]);
    if (mode === "metric-fail") throw Error("metric");
  };
  const warn = (message: string) => trace.push(["warn", message]);
  let api: any;
  if (upstream) {
    const source = extensionBindings(
      [
        "_r",
        "Uo",
        "br",
        "Ki",
        "Sk",
        "Df",
        "Fo",
        "Ck",
        "Nf",
        "Bo",
        "Zi",
        "wr",
        "Dk",
        "jf",
        "qf",
        "Hf",
        "Nk",
        "Ji",
        "Uk",
        "Gf",
      ],
      {
        chrome,
        vr: edge,
        $k: () => "Chrome",
        gk: clear,
        Un: metric,
        Rk: "codex_chrome_extension_sidechat_open",
        jn: "codexSidePanelOpenWindowIds",
        console: { warn },
        Lf: undefined,
        Uf: false,
      },
    );
    api = {
      open: source.qf,
      toggle: source.jf,
      register: source.Dk,
      recordState: source.Ji,
      isOpen: source.Gf,
    };
  } else
    api = createSidePanelWindowController({
      chrome,
      tabs: createSidePanelTabController({ chrome, isEdge: edge, warn }),
      isEdge: edge,
      browserName: () => "Chrome",
      clearActionCallout: clear,
      reportOpen: (source) =>
        metric("codex_chrome_extension_sidechat_open", 1, {
          destination: "work_sidepanel",
          source,
        }),
      warn,
    });
  return { api, trace, opened, closed, release: () => release() };
}
const result = async (p: Promise<any>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as Error).message;
  }
};
test("side panel opens before enable resolves, then persists shared tab/window state", async () => {
  const outputs = [];
  for (const upstream of [true, false]) {
    const f = fixture(upstream, "enable-pending");
    const work = f.api.open(10, 4, "fixture");
    assert.deepEqual(
      f.trace.map((row) => row[0]),
      ["options", "open"],
    );
    f.release();
    await work;
    await flush();
    assert.equal(f.api.isOpen(10, 4), true);
    await f.api.toggle({ id: 4, windowId: 10 }, "fixture");
    assert.equal(f.api.isOpen(10, 4), false);
    outputs.push(f.trace);
  }
  assert.deepEqual(outputs[1], outputs[0]);
});
test("side panel open/close errors, Edge scope and diagnostic failures match source", async () => {
  for (const mode of [
    "normal",
    "edge",
    "open-fail",
    "enable-fail",
    "close-fail",
    "storage-fail",
    "callout-fail",
    "metric-fail",
    "missing-window",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream, mode);
      const a = await result(
        f.api.toggle(
          mode === "missing-window" ? undefined : { id: 4, windowId: 10 },
          "fixture",
        ),
      );
      const active = f.api.isOpen(10, 4);
      const b = await result(f.api.toggle({ id: 4, windowId: 10 }, "fixture"));
      await flush();
      outputs.push({
        a,
        b,
        active,
        final: f.api.isOpen(10, 4),
        trace: f.trace,
      });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
test("side panel events preserve per-tab/global union and register only once", async () => {
  const outputs = [];
  for (const upstream of [true, false]) {
    const f = fixture(upstream, "normal");
    f.api.register();
    f.api.register();
    f.opened[0]({ windowId: 10, tabId: 1 });
    f.opened[0]({ windowId: 10, tabId: 2 });
    await flush();
    await f.api.recordState(10, true);
    f.closed[0]({ windowId: 10, tabId: 1 });
    await flush();
    const globalOpen = f.api.isOpen(10, 1);
    await f.api.recordState(10, false);
    const removed = f.api.isOpen(10, 1),
      retained = f.api.isOpen(10, 2);
    f.closed[0]({ windowId: 10, tabId: 2 });
    await flush();
    outputs.push({
      globalOpen,
      removed,
      retained,
      final: f.api.isOpen(10, 2),
      trace: f.trace,
    });
  }
  assert.deepEqual(outputs[1], outputs[0]);
});
