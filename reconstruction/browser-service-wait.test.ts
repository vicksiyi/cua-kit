import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { rejectBlockedNavigation } from "../packages/browser/src/service/cdp/page_load";
import { waitForNetworkIdle } from "../packages/browser/src/service/cdp/network_idle";
import {
  PlaywrightWaitForLoadStateCommand as load,
  PlaywrightWaitForUrlCommand as url,
  PlaywrightWaitForTimeoutCommand as delay,
  urlGlobPattern,
  navigationMatchedUrl,
} from "../packages/browser/src/service/commands/wait";
const original = originalServiceBindings(
  [
    "F",
    "C2",
    "Bv",
    "nre",
    "ore",
    "A2",
    "I2",
    "P2",
    "ire",
    "R2",
    "sre",
    "Dc",
    "Dv",
    "Io",
    "Hn",
    "Rv",
    "W",
    "Ve",
  ],
  {
    wte: "Page.navigationBlocked",
    Wn: rejectBlockedNavigation,
    T2: waitForNetworkIdle,
  },
);
const event = (
  method: string,
  params: any = {},
  source: any = { tabId: 7 },
) => ({ method, params, source });
async function run(command: any, payload: any, scenario: string) {
  const trace: any[] = [];
  let reads = 0;
  const ctx: any = {
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent(value: any) {
          trace.push(["observe", value]);
          return {
            async assert() {
              trace.push("assert");
              if (scenario === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://start.test/";
      },
    },
    cdp: {
      async call(id: number, method: string, params: any) {
        trace.push(["call", id, method, params]);
        if (scenario === "no-frame" && method === "Page.getFrameTree")
          throw Error("frame unavailable");
        return { frameTree: { frame: { id: "root" } } };
      },
      async readDocumentState() {
        reads++;
        trace.push("read");
        return {
          href:
            scenario === "already" || (scenario === "race" && reads > 1)
              ? "https://dest.test/a"
              : "https://start.test/",
          readyState:
            scenario === "complete"
              ? "complete"
              : scenario === "interactive"
                ? "interactive"
                : "loading",
        };
      },
      async waitForEvent(id: number, predicate: any, options: any) {
        trace.push(["wait", id, options.timeoutMs, options.timeoutMessage]);
        if (await options.initialCheck()) return;
        const events =
          scenario === "blocked"
            ? [
                event("Page.navigationBlocked", {
                  resourceType: "mainFrame",
                  url: "https://denied.test/?secret=1",
                }),
              ]
            : [
                event("Page.navigationBlocked", { resourceType: "subFrame" }),
                event(
                  "Page.loadEventFired",
                  {},
                  { tabId: 7, sessionId: "child" },
                ),
                event("Page.frameNavigated", {
                  frame: {
                    id: "child",
                    parentId: "root",
                    url: "https://dest.test/a",
                  },
                }),
                event("Page.navigatedWithinDocument", {
                  frameId: "root",
                  url: "https://dest.test/a",
                }),
                event("Page.domContentEventFired"),
                event("Page.loadEventFired"),
              ];
        for (const candidate of events) {
          const accepted = predicate(candidate);
          trace.push(["event", candidate.method, accepted]);
          if (accepted) return candidate;
        }
        throw Error(options.timeoutMessage);
      },
    },
  };
  try {
    return { value: await command(payload, ctx), trace };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("wait commands match original authority order, readiness, URL races, frame fallback and blocking", async () => {
  for (const [command, reference, payload] of [
    [load, original.C2, { tab_id: "7", state: "load", timeout_ms: 31 }],
    [
      load,
      original.C2,
      { tab_id: "7", state: "domcontentloaded", timeout_ms: 31 },
    ],
    [
      url,
      original.I2,
      { tab_id: "7", url: "https://dest.test/*", timeout_ms: 31 },
    ],
    [
      url,
      original.I2,
      {
        tab_id: "7",
        url: "https://dest.test/*",
        wait_until: "load",
        timeout_ms: 31,
      },
    ],
    [url, original.I2, { tab_id: "7", url: "", timeout_ms: 31 }],
    [load, original.C2, { tab_id: "bad", timeout_ms: 31 }],
  ] as const) {
    for (const scenario of [
      "normal",
      "already",
      "race",
      "complete",
      "interactive",
      "no-frame",
      "blocked",
      "denied",
    ]) {
      assert.deepEqual(
        await run(command, payload, scenario),
        await run(reference, payload, scenario),
        JSON.stringify([payload, scenario]),
      );
    }
  }
  assert.deepEqual(
    (await run(url, { tab_id: 7, url: "https://dest.test/*" }, "race")).value,
    { url: "https://dest.test/a" },
  );
  assert.equal((await run(load, { tab_id: 7 }, "denied")).error, "denied");
  assert.deepEqual(await delay({ tab_id: 7, timeout_ms: 0 }, undefined), {});
  await assert.rejects(() => delay({ tab_id: 0, timeout_ms: 0 }, undefined));
});
test("URL glob and frame matching preserve literal metacharacters and original event distinctions", () => {
  for (const pattern of [
    "",
    "*",
    "**",
    "https://x/*",
    "https://x/**",
    "https://x/a?b=[c]",
    "a\\b",
    "***",
    "(a)+{b}|^$",
  ])
    assert.equal(urlGlobPattern(pattern), original.sre(pattern));
  assert.equal(
    new RegExp(urlGlobPattern("https://x/*")).test("https://x/a/b"),
    false,
  );
  assert.equal(
    new RegExp(urlGlobPattern("https://x/**")).test("https://x/a/b"),
    true,
  );
  for (const frame of [undefined, "root"])
    for (const candidate of [
      event("Page.frameNavigated", { frame: { id: "root", url: "match" } }),
      event("Page.frameNavigated", {
        frame: { id: "child", parentId: "root", url: "match" },
      }),
      event("Page.navigatedWithinDocument", { frameId: "child", url: "match" }),
      event("Page.frameNavigated", null),
      event("Page.frameNavigated", { frame: [] }),
    ])
      assert.equal(
        navigationMatchedUrl(candidate, frame, (value) => value === "match"),
        original.R2(candidate, frame, (value: string) => value === "match"),
      );
});

test("wait commands execute real Chromium navigation, document readiness and network idle", async () => {
  const { chromium } = await import("playwright");
  const { EventEmitter } = await import("node:events");
  const { createServer } = await import("node:http");
  const { waitForCdpEvent } =
    await import("../packages/browser/src/service/cdp/event_wait");
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<title>wait test</title><p>Ready</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const target = `http://127.0.0.1:${address.port}/target`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(),
      session = await page.context().newCDPSession(page);
    const cdp: any = new EventEmitter();
    cdp.call = (_tab: number, method: string, params: any) =>
      session.send(method as any, params);
    cdp.waitForEvent = waitForCdpEvent.bind(cdp);
    cdp.readDocumentState = async () => {
      const result = await session.send("Runtime.evaluate", {
        expression: "({href:location.href,readyState:document.readyState})",
        returnByValue: true,
      });
      return result.result.value;
    };
    for (const method of [
      "Page.frameNavigated",
      "Page.navigatedWithinDocument",
      "Page.domContentEventFired",
      "Page.loadEventFired",
      "Page.lifecycleEvent",
    ])
      session.on(method as any, (params: any) =>
        cdp.emit("event", event(method, params)),
      );
    const context: any = {
      cdp,
      security: { currentTabUrl: async () => page.url() },
      acquireAuthority: () => ({
        observeContent: () => ({ assert: async () => {} }),
      }),
    };
    const waiting = url(
      { tab_id: 7, url: target, wait_until: "load", timeout_ms: 3000 },
      context,
    );
    const navigation = page.goto(target);
    const [result] = await Promise.all([waiting, navigation]);
    assert.deepEqual(result, { url: target });
    assert.deepEqual(
      await load({ tab_id: 7, state: "domcontentloaded" }, context),
      {},
    );
    assert.deepEqual(
      await load(
        { tab_id: 7, state: "networkidle", timeout_ms: 3000 },
        context,
      ),
      {},
    );
    assert.equal(cdp.listenerCount("event"), 0);
    assert.equal(cdp.listenerCount("tabDetached"), 0);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
