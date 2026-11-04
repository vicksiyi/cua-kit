import assert from "node:assert/strict";
import test from "node:test";
import {
  createCommandExecution,
  splitMcpFrameSelector,
  translateMcpFramePoint,
} from "../packages/browser/src/service/runtime/command_execution";
import { originalServiceBindings, serviceExpression } from "./service-source";
const op = {
  Prepare: "mcp_app_frame_prepare",
  Activate: "mcp_app_frame_activate",
  Release: "mcp_app_frame_release",
};
function original() {
  return originalServiceBindings(["f5", "h5", "m5", "TA"], {
    EA: new WeakMap(),
    op,
  });
}
function fixture(useOriginal: boolean, flags: any = {}) {
  const trace: any[] = [];
  let depth = 0,
    callback: any;
  const makePlaywright = (name: string): any => ({
    async evaluateOnPlaywrightPage(tab: any, fn: any, args: any) {
      trace.push(["split", tab, args]);
      return flags.one ? ["only"] : ["outer", "inner", "button"];
    },
    async resolvePlaywrightSelectorNode(tab: any, selector: any, options: any) {
      trace.push(["resolve", name, tab, selector, options]);
      if (flags.resolveError && name !== "root") throw Error("resolve");
      return { backendNodeId: ++depth };
    },
    async evaluateOnPlaywrightNode(node: any, fn: any, args: any) {
      trace.push([
        args ? "translate" : "scroll",
        name,
        node.backendNodeId,
        args,
      ]);
      if (args) return { result: { x: args.arg.x + 10, y: args.arg.y + 20 } };
      if (flags.scrollError) throw Error("scroll");
    },
    forDocument(cdp: any, translate: any) {
      trace.push(["playwright.forDocument", cdp]);
      callback = translate;
      return makePlaywright(cdp.sessionId);
    },
  });
  const context: any = {
    clientInfo: { type: flags.type ?? "mcpapps" },
    cdp: {
      forDocument(params: any) {
        trace.push(["cdp.forDocument", params]);
        return params;
      },
    },
    playwright: makePlaywright("root"),
    tabs: {
      async get(tab: any) {
        trace.push(["get", tab]);
        return {
          url: flags.missingUrl ? undefined : "https://root.invalid/app",
        };
      },
    },
    clipboard: {
      async disposePageClipboard(cdp: any) {
        trace.push(["clipboard.dispose", cdp]);
        if (flags.clipboardError) throw Error("clipboard");
      },
    },
    acquireAuthority(options: any) {
      trace.push(["authority", options]);
      return {
        observeContent(url: any) {
          trace.push(["observe", url]);
          return {
            async assert() {
              trace.push(["assert"]);
              if (flags.authorityError) throw Error("authority");
            },
          };
        },
      };
    },
    async executeUnhandledCommand(cmd: any) {
      trace.push(["backend", cmd]);
      if (cmd.type === op.Prepare) {
        if (flags.invalidResponse) return { token: 1 };
        return {
          token: "frame-" + depth,
          url: flags.invalidUrl
            ? "bad"
            : flags.srcdoc
              ? "about:srcdoc"
              : flags.sameOrigin
                ? "https://root.invalid/frame"
                : "https://embedded.invalid/frame",
        };
      }
      if (cmd.type === op.Activate && flags.activateError)
        throw Error("activate");
      if (cmd.type === op.Release && flags.releaseError) throw Error("release");
    },
  };
  const execute = async (c: any, p: any) => {
    trace.push(["execute", c === context, c.cdp.sessionId, p]);
    if (flags.translate)
      trace.push(["translation.result", await callback({ x: 1, y: 2 })]);
    if (flags.executeError) throw Error("execute");
    return "result";
  };
  return {
    trace,
    context,
    execute,
    run: useOriginal ? original().TA : createCommandExecution(),
  };
}
async function attempt(fn: any) {
  try {
    return { result: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("MCP frame execution matches original authority, document switching, translation and reverse cleanup", async () => {
  for (const flags of [
    {},
    { sameOrigin: true },
    { srcdoc: true },
    { one: true },
    { missingUrl: true },
    { invalidResponse: true },
    { invalidUrl: true },
    { resolveError: true },
    { scrollError: true },
    { authorityError: true },
    { activateError: true },
    { clipboardError: true },
    { releaseError: true },
    { executeError: true },
    { executeError: true, clipboardError: true },
    { translate: true },
    { type: "extension" },
  ]) {
    const a = fixture(true, flags),
      b = fixture(false, flags),
      params = {
        tab_id: "3",
        selector: "iframe >> internal:control=enter-frame >> button",
      };
    assert.deepEqual(
      await attempt(() => b.run(b.context, params, b.execute)),
      await attempt(() => a.run(a.context, params, a.execute)),
      JSON.stringify(flags),
    );
    assert.deepEqual(b.trace, a.trace);
    if (!Object.keys(flags).length)
      assert.deepEqual(
        b.trace
          .filter((x) => x[0] === "backend" && x[1].type === op.Release)
          .map((x) => x[1].token),
        ["frame-2", "frame-1"],
      );
    if (flags.translate) {
      assert.equal(
        b.trace.find((x) => x[0] === "translation.result")[1],
        undefined,
      );
      assert.deepEqual(
        b.trace.filter((x) => x[0] === "translate").map((x) => x[2]),
        [2, 1],
      );
    }
  }
  for (const tab of ["bad", "9007199254740992", 0, -1]) {
    const a = fixture(true),
      b = fixture(false);
    const p = { tab_id: tab, selector: "x internal:control=enter-frame y" };
    assert.deepEqual(
      await attempt(() => b.run(b.context, p, b.execute)),
      await attempt(() => a.run(a.context, p, a.execute)),
    );
    assert.deepEqual(b.trace, a.trace);
  }
});
test("MCP serialization shares CDP/tab queue, leaves other tabs concurrent and recovers after failure", async () => {
  for (const make of [() => original().TA, createCommandExecution]) {
    const run = make(),
      cdp = {};
    const context = { clientInfo: { type: "mcpapps" }, cdp };
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      started = new Promise<void>((r) => (entered = r));
    const order: string[] = [];
    const first = attempt(() =>
      run(context, { tab_id: "3" }, async () => {
        order.push("first");
        entered();
        await gate;
        throw Error("first");
      }),
    );
    await started;
    const second = run({ ...context }, { tab_id: 3 }, async () => {
      order.push("second");
      return 2;
    });
    await run(context, { tab_id: 4 }, async () => {
      order.push("other");
    });
    assert.deepEqual(order, ["first", "other"]);
    release();
    assert.deepEqual(await first, { error: "first" });
    assert.equal(await second, 2);
    assert.deepEqual(order, ["first", "other", "second"]);
  }
});
test("selector splitting matches original parsed parts, captures and empty boundaries", async () => {
  const oracle = original().f5;
  const part = (name: string, source: string, body: any = source) => ({
    name,
    source,
    body,
  });
  for (const parsed of [
    {
      parts: [
        part("css", "iframe"),
        part("internal:control", "enter-frame"),
        part("css", "button"),
      ],
    },
    { parts: [part("css", "button")], capture: 0 },
    { parts: [] },
    { parts: [part("internal:control", "enter-frame")] },
    { parts: [part("css", "iframe"), part("internal:control", "enter-frame")] },
    { parts: [part("css", "a"), part("text", '"Text"')] },
  ]) {
    const injected = { parseSelector: () => parsed };
    assert.deepEqual(
      await attempt(() => splitMcpFrameSelector(injected, "ignored")),
      await attempt(() => oracle(injected, "ignored")),
    );
  }
});
test("frame pointer translation matches original inside real Chromium DOM", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<style>body{margin:0} #host{margin:20px} iframe{width:200px;height:120px;border:3px solid black}</style><div id="host"><iframe id="frame" srcdoc="<button>Click</button>"></iframe></div>',
    );
    const originalSource = serviceExpression("h5"),
      restoredSource = translateMcpFramePoint.toString();
    for (const mode of [
      "plain",
      "hidden",
      "transform",
      "zoom",
      "rotate",
      "covered",
      "outside",
      "negative",
      "wrong-element",
    ]) {
      const results = await page.evaluate(
        ({ originalSource, restoredSource, mode }) => {
          const frame = document.querySelector("#frame") as HTMLIFrameElement,
            host = document.querySelector("#host") as HTMLElement;
          host.style.cssText = "";
          frame.style.visibility = "";
          document.querySelector("#cover")?.remove();
          if (mode === "hidden") frame.style.visibility = "hidden";
          if (mode === "transform") host.style.transform = "translateX(2px)";
          if (mode === "zoom") host.style.zoom = "1.1";
          if (mode === "rotate") host.style.rotate = "2deg";
          if (mode === "covered") {
            const cover = document.createElement("div");
            cover.id = "cover";
            cover.style.cssText = "position:fixed;inset:0;z-index:10";
            document.body.append(cover);
          }
          const injected = {
            elementState(element: any) {
              return {
                matches: getComputedStyle(element).visibility !== "hidden",
              };
            },
            expectHitTarget(point: any, element: any) {
              return document.elementFromPoint(point.x, point.y) === element
                ? "done"
                : "blocked";
            },
          };
          const point =
            mode === "outside"
              ? { x: 200, y: 0 }
              : mode === "negative"
                ? { x: -1, y: 0 }
                : { x: 5, y: 6 };
          return [originalSource, restoredSource].map((source) => {
            try {
              return {
                point: (0, eval)(`(${source})`)(
                  mode === "wrong-element" ? host : frame,
                  injected,
                  point,
                ),
              };
            } catch (error: any) {
              return { error: error.message };
            }
          });
        },
        { originalSource, restoredSource, mode },
      );
      assert.deepEqual(results[1], results[0], mode);
      if (mode === "plain")
        assert.deepEqual(results[1].point, { x: 28, y: 29 });
      else assert.equal(typeof results[1].error, "string");
    }
  } finally {
    await browser.close();
  }
});
