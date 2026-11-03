import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  NavigateTabBackCommand as back,
  NavigateTabForwardCommand as forward,
  NavigateTabReloadCommand as reload,
} from "../packages/browser/src/service/commands/history_navigation";
import { waitForPageLoadEvent } from "../packages/browser/src/service/cdp/page_load";
const original = originalServiceBindings(["F", "FN", "LN", "UN"]);
async function run(command: any, payload: any, mode: string) {
  const trace: any[] = [];
  const context: any = {
    acquireAuthority() {
      trace.push("authority");
      return {
        actInFrame(url: unknown) {
          trace.push(["act", url]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test/";
      },
    },
    async followSessionTab(id: number) {
      trace.push(["follow", id]);
      if (mode === "follow-error") throw Error("follow failed");
    },
    cdp: {
      async call(id: number, method: string, params: any) {
        trace.push(["call", id, method, params]);
        if (mode === "call-error") throw Error("CDP failed");
        return {
          currentIndex: mode === "first" ? 0 : mode === "last" ? 2 : 1,
          entries: [{ id: 11 }, { id: 22 }, { id: 33 }],
        };
      },
      waitForPageLoadEvent(id: number, options: any) {
        trace.push(["wait", id, options]);
        return mode === "wait-error"
          ? Promise.reject(Error("load failed"))
          : Promise.resolve();
      },
    },
  };
  try {
    return { value: await command(payload, context), trace };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("history navigation preserves original authority, history boundaries, timeout and listener ordering", async () => {
  for (const [command, reference] of [
    [back, original.FN],
    [forward, original.LN],
    [reload, original.UN],
  ])
    for (const mode of [
      "normal",
      "denied",
      "follow-error",
      "call-error",
      "wait-error",
      "first",
      "last",
    ])
      for (const payload of [
        { tab_id: "7" },
        { tab_id: 0, timeout_ms: 12 },
        { tab_id: 7, timeout_ms: -1 },
      ])
        assert.deepEqual(
          await run(command, payload, mode),
          await run(reference, payload, mode),
        );
  const result = await run(back, { tab_id: 7 }, "normal");
  assert.deepEqual(result.value, {});
  assert.ok(
    result.trace.findIndex((x) => x[0] === "wait") <
      result.trace.findIndex((x) => x[2] === "Page.navigateToHistoryEntry"),
  );
  assert.equal(
    (await run(forward, { tab_id: 7 }, "last")).error,
    "Cannot navigate forward: no next page in history.",
  );
});
test("history commands navigate backward, forward and reload in Chromium with reconstructed load waiter", async () => {
  const { chromium } = await import("playwright");
  const { EventEmitter } = await import("node:events");
  const { createServer } = await import("node:http");
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    res.setHeader("Content-Type", "text/html");
    res.end(`<title>${req.url}</title>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      session = await page.context().newCDPSession(page);
    const cdp: any = new EventEmitter();
    cdp.mainFrameIdsByTabId = new Map();
    cdp.call = (_id: number, method: string, params: any) =>
      session.send(method as any, params);
    cdp.waitForPageLoadEvent = waitForPageLoadEvent.bind(cdp);
    for (const method of [
      "Page.frameNavigated",
      "Page.frameStartedLoading",
      "Page.navigatedWithinDocument",
      "Page.domContentEventFired",
      "Page.loadEventFired",
    ])
      session.on(method as any, (params: any) => {
        if (method === "Page.frameNavigated" && params.frame.parentId == null)
          cdp.mainFrameIdsByTabId.set(7, params.frame.id);
        cdp.emit("event", { method, params, source: { tabId: 7 } });
      });
    await session.send("Page.enable");
    await page.goto(origin + "/one");
    await page.goto(origin + "/two");
    const context: any = {
      cdp,
      security: { currentTabUrl: async () => page.url() },
      acquireAuthority: () => ({
        actInFrame: () => ({ assert: async () => {} }),
      }),
      followSessionTab: async () => {},
    };
    await back({ tab_id: 7, timeout_ms: 3000 }, context);
    assert.equal(page.url(), origin + "/one");
    await forward({ tab_id: 7, timeout_ms: 3000 }, context);
    assert.equal(page.url(), origin + "/two");
    const before = requests;
    await reload({ tab_id: 7, timeout_ms: 3000 }, context);
    assert.equal(page.url(), origin + "/two");
    assert.ok(requests > before);
    assert.equal(cdp.listenerCount("event"), 0);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
