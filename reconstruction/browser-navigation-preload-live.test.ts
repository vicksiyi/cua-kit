import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import { Tab } from "../packages/browser/src/tab";
import { createNavigateTabUrlCommand } from "../packages/browser/src/service/commands/url_navigation";
import { waitForCdpEvent } from "../packages/browser/src/service/cdp/event_wait";
import { dispatchTimeout } from "../packages/browser/src/service/cdp/deadline";
import { createBrowserHostFactory } from "../packages/browser/dist/service/runtime/host.js";
import { initializeAccessibilityCore } from "../packages/browser/dist/service/accessibility/capture_manager.js";

test("real CDP main-frame navigation triggers host AX preload and removes event waiters", async (t) => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<title>Navigation preload fixture</title><button>Ready</button>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as any).port}/`;
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const session = await page.context().newCDPSession(page);
  const env = Object.freeze({});
  const host = await createBrowserHostFactory({
    getPrivilegedRepl: () => ({
      env,
      config: {},
      createElicitation: async () => ({ action: "cancel" }),
    }),
    createAccessAssertion: () => async () => {},
    registerAutomatedReviewHost: () => {},
    createConfig: () => ({}),
    BrowserDirectory: class {},
    extensionSelection: () => ({}),
    Preferences: class {},
    commandTiming: {},
    createErrorReporter: () => ({}),
    performanceSpan: {},
    trackElicitation: async (_r: any, fn: any) => fn(),
    initializeCredentialObservation: async () => {},
    getNativeCredentialObservationStatus: () => {},
    createBrowserAuthBrokerChallenge: () => {},
  } as any).createHost();
  const trace: string[] = [];
  let starts = 0,
    cancellations = 0;
  const preload = host.preloadAccessibilityCore;
  host.preloadAccessibilityCore = () => {
    starts++;
    trace.push("preload");
    const cancel = preload();
    assert.equal(typeof cancel, "function");
    return () => {
      cancellations++;
      cancel();
    };
  };
  const cdp: any = new EventEmitter();
  for (const method of [
    "Page.frameStartedLoading",
    "Page.frameNavigated",
    "Page.navigatedWithinDocument",
    "Page.domContentEventFired",
    "Page.loadEventFired",
  ])
    session.on(method as any, (params: any) => {
      trace.push(method);
      cdp.emit("event", { method, params, source: { tabId: 7 } });
    });
  cdp.readDocumentState = async () => ({ href: page.url() });
  cdp.waitForEvent = waitForCdpEvent.bind(cdp);
  cdp.call = async (
    _id: number,
    method: string,
    params: any = {},
    options: any = {},
  ) => {
    dispatchTimeout(options);
    if (method === "Page.navigate") trace.push("dispatch navigate");
    return session.send(method as any, params);
  };
  const context: any = {
    environment: "orbit",
    clientInfo: { type: "cdp" },
    runtime: host,
    cdp,
    acquireAuthority: () => ({
      triggerNetworkEgress: (target: string) => ({
        assert: async () => {
          assert.equal(target, url);
          trace.push("authorized");
        },
      }),
    }),
    followSessionTab: async () => {},
    documentResponses: {},
    getCurrentSessionId: () => "fixture",
  };
  const navigate = createNavigateTabUrlCommand(async () => {});
  const tab = new Tab({
    browserId: "fixture",
    tabPayload: { id: "7" },
    documentation: { get: async () => "" } as any,
    transport: {
      send: async ({ command }: any) => navigate(command.parse(), context),
    } as any,
  });
  await tab.goto(url, { prepareAccessibility: true });
  assert.equal(page.url(), url);
  assert.equal(await page.title(), "Navigation preload fixture");
  assert.equal(starts, 1);
  assert.equal(cancellations, 0);
  assert(trace.indexOf("preload") > trace.indexOf("dispatch navigate"));
  assert(trace.indexOf("preload") >= trace.indexOf("Page.frameStartedLoading"));
  assert(trace.indexOf("preload") < trace.indexOf("Page.domContentEventFired"));
  assert.equal(cdp.listenerCount("event"), 0);
  assert.equal(cdp.listenerCount("tabDetached"), 0);
  await initializeAccessibilityCore(undefined, { env });
  assert.equal(preload(), undefined);
});
