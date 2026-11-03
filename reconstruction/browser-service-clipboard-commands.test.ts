import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { BrowserClipboard } from "../packages/browser/src/service/context/browser_clipboard";
import {
  TabClipboardReadCommand as read,
  TabClipboardReadTextCommand as readText,
  TabClipboardWriteCommand as write,
  TabClipboardWriteTextCommand as writeText,
} from "../packages/browser/src/service/commands/clipboard";
const original = originalServiceBindings([
  "F",
  "W",
  "are",
  "ure",
  "O2",
  "Ov",
  "B2",
  "D2",
  "M2",
  "N2",
]);
async function run(command: any, payload: any, mode: string) {
  const trace: any[] = [],
    store = new BrowserClipboard();
  store.write(
    [
      {
        entries: [
          { mime_type: "text/plain", base64: "YQ==" },
          { mime_type: "text/plain", text: "second" },
        ],
      },
    ],
    "fixture",
  );
  const ctx: any = {
    cdp: {},
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test/";
      },
    },
    acquireAuthority() {
      trace.push("authority");
      const authority = (kind: string) => (url: string) => {
        trace.push([kind, url]);
        return {
          async assert() {
            trace.push("assert");
            if (mode === "denied") throw Error("denied");
          },
        };
      };
      return {
        observeContent: authority("observe"),
        actInFrame: authority("act"),
      };
    },
    clipboard: {
      async ensurePageClipboard(_cdp: any, target: any) {
        trace.push(["ensure", target]);
        if (mode === "bridge-error") throw Error("bridge failed");
      },
      async runExclusive(fn: any) {
        trace.push("exclusive");
        return store.runExclusive(fn);
      },
      read() {
        trace.push("read");
        return store.read();
      },
      write(items: any, operation: string) {
        trace.push(["write", items, operation]);
        store.write(items, operation);
      },
    },
  };
  let result;
  try {
    result = { value: await command(payload, ctx) };
  } catch (e) {
    result = { error: (e as Error).message };
  }
  return { ...result, trace, items: store.read() };
}
test("clipboard commands preserve original validation, authority, bridge and serialization order", async () => {
  for (const [command, reference] of [
    [read, original.B2],
    [readText, original.D2],
    [write, original.M2],
    [writeText, original.N2],
  ]) {
    for (const mode of ["normal", "denied", "bridge-error"])
      for (const payload of [
        {
          tab_id: 7,
          text: "中🙂",
          items: [{ entries: [{ mime_type: "text/html", text: "<b>x</b>" }] }],
        },
        { tab_id: 0, text: null, items: [] },
        { tab_id: 7, text: null, items: [] },
      ])
        assert.deepEqual(
          await run(command, payload, mode),
          await run(reference, payload, mode),
        );
  }
  assert.deepEqual((await run(readText, { tab_id: 7 }, "normal")).value, {
    text: "",
  });
  assert.equal(
    (await run(writeText, { tab_id: 7, text: null }, "normal")).error,
    "tab_clipboard_write_text requires text",
  );
});
test("clipboard commands share the reconstructed store with real Chromium navigator.clipboard", async () => {
  const { chromium } = await import("playwright");
  const { CdpEventEmitter } =
    await import("../packages/browser/src/service/cdp/event_emitter");
  const browser = await chromium.launch({ headless: true });
  const store = new BrowserClipboard();
  try {
    const page = await browser.newPage(),
      session = await page.context().newCDPSession(page);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    const cdp = Object.assign(new CdpEventEmitter(), {
      addTabCleanupHandler: () => () => {},
      callTarget: async (_target: unknown, method: string, params: any) =>
        session.send(method as any, params),
    });
    session.on("Runtime.bindingCalled", (params) =>
      cdp.emit("event", {
        method: "Runtime.bindingCalled",
        source: { tabId: 1 },
        params,
      }),
    );
    const allow = () => ({ assert: async () => {} });
    const ctx: any = {
      cdp,
      clipboard: store,
      security: { currentTabUrl: async () => page.url() },
      acquireAuthority: () => ({ observeContent: allow, actInFrame: allow }),
    };
    await writeText({ tab_id: 1, text: "命令→页面🙂" }, ctx);
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "命令→页面🙂",
    );
    await page.evaluate(() => navigator.clipboard.writeText("页面→命令"));
    assert.deepEqual(await readText({ tab_id: 1 }, ctx), { text: "页面→命令" });
    const items = [
      {
        entries: [
          { mime_type: "text/html", text: "<b>rich</b>" },
          { mime_type: "text/plain", text: "rich" },
        ],
        presentation_style: "unspecified",
      },
    ];
    await write({ tab_id: 1, items }, ctx);
    assert.deepEqual(await read({ tab_id: 1 }, ctx), { items });
    assert.equal(
      await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        return (await items[0].getType("text/html")).text();
      }),
      "<b>rich</b>",
    );
    await store.dispose();
  } finally {
    await browser.close();
  }
});
