import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createContentRuntime } from "../packages/browser-extension/src/content_runtime";
import { createObservedTabsClass } from "../packages/browser-extension/src/observed_tabs";
import {
  createOverlayManagerClass,
  createCursorMessageHandler,
} from "../packages/browser-extension/src/overlay_manager";
import { createBrowserCommandHandlerClass } from "../packages/browser-extension/src/command_handler";
const contentBundle = await readFile(
  "packages/browser-extension/dist/content-scripts/codex.js",
  "utf8",
);
test("restored background manager roundtrips state and actual Chromium cursor arrivals to command waiters", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    await page.setContent("<html><head></head><body></body></html>");
    let route: ReturnType<typeof createCursorMessageHandler>;
    const received: any[] = [],
      sent: any[] = [];
    let injections = 0,
      timeouts = 0;
    await page.exposeFunction("sendBackground", async (message: any) => {
      received.push(message);
      return await new Promise((resolve) =>
        route(message, { tab: { id: 7 } } as any, resolve),
      );
    });
    await page.evaluate("globalThis.__name=(fn)=>fn");
    await page.evaluate(() => {
      const g = globalThis as any,
        listeners = new Set<Function>(),
        frames = new Map<number, FrameRequestCallback>();
      let id = 0,
        time = 0;
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        const root = attach.call(this, options);
        g.overlayShadow = root;
        return root;
      };
      Object.defineProperty(performance, "now", { value: () => time });
      window.requestAnimationFrame = (fn) => {
        frames.set(++id, fn);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        frames.delete(id);
      };
      g.advance = () => {
        time += 17;
        const pending = [...frames.values()];
        frames.clear();
        for (const fn of pending) fn(time);
      };
      g.chrome = {
        runtime: {
          id: "fixture",
          getURL: (path: string) => `chrome-extension://fixture/${path}`,
          sendMessage: g.sendBackground,
          onMessage: {
            addListener: (fn: Function) => listeners.add(fn),
            removeListener: (fn: Function) => listeners.delete(fn),
          },
        },
      };
      g.receive = (message: any) =>
        new Promise((resolve, reject) => {
          let handled = false;
          for (const listener of [...listeners])
            if (listener(message, {}, resolve)) handled = true;
          if (!handled) reject(new Error("No content receiver"));
        });
    });
    const chrome: any = {
      tabs: {
        query: async () => [{ id: 7, windowId: 1 }],
        sendMessage: async (id: number, message: any) => {
          assert.equal(id, 7);
          sent.push(message);
          return page.evaluate(
            (message) => (globalThis as any).receive(message),
            message,
          );
        },
      },
      scripting: {
        executeScript: async (options: any) => {
          assert.deepEqual(options, {
            files: ["content-scripts/codex.js"],
            injectImmediately: true,
            target: { tabId: 7 },
          });
          injections++;
          await page.evaluate(
            (source) => new Function(source + ";return codex")(),
            contentBundle,
          );
          return [{ result: undefined }];
        },
      },
    };
    const host = { chrome, setTimeout, clearTimeout },
      contentRuntime = createContentRuntime(host),
      Observed = createObservedTabsClass(chrome),
      observed = new Observed(),
      Manager = createOverlayManagerClass({ ...host, contentRuntime }),
      overlay = new Manager({ observedTabs: observed });
    observed.setChangeHandler((ids) => overlay.republishTabStates(ids));
    // Use the actual handler waiter/notification methods; other RPC/session methods are outside this test.
    const Handler = createBrowserCommandHandlerClass({
      chrome,
      setTimeout: ((fn: () => void, ms: number) =>
        setTimeout(() => {
          timeouts++;
          fn();
        }, ms)) as any,
      clearTimeout,
    } as any);
    const handler = Object.create(Handler.prototype);
    handler.cursorArrivalWaitersByKey = new Map();
    route = createCursorMessageHandler(overlay, handler);
    await observed.initialize();
    await overlay.startSession("session", "turn");
    await overlay.trackTab("session", 7);
    assert.equal(injections, 1);
    const signal = await overlay.startRequest("session", 7);
    for (const [moveSequence, x, y] of [
      [1, 10, 20],
      [2, 900, 600],
    ]) {
      const waiter = handler.createCursorArrivalWaiter({
        moveSequence,
        sessionId: "session",
        turnId: "turn",
      });
      assert.equal(
        await overlay.setCursorState("session", 7, "turn", {
          moveSequence,
          x,
          y,
          visible: true,
        }),
        true,
      );
      for (
        let i = 0;
        i < 180 && handler.cursorArrivalWaitersByKey.size > 0;
        i++
      )
        await page.evaluate(() => (globalThis as any).advance());
      await waiter.promise;
      assert.equal(
        timeouts,
        0,
        "arrival must resolve before the fallback timeout",
      );
    }
    assert.deepEqual(
      received
        .filter((m) => m.type === "AGENT_CURSOR_ARRIVED")
        .map((m) => m.moveSequence),
      [1, 2],
    );
    const dom = await page.evaluate(() => {
      const shadow = (globalThis as any).overlayShadow as ShadowRoot;
      return {
        transform: (
          shadow.querySelector(
            '[data-testid="browser-agent-cursor"]',
          ) as HTMLElement
        ).style.transform,
        display: (shadow.querySelector(".codex-agent-overlay") as HTMLElement)
          .style.display,
      };
    });
    assert.match(dom.transform, /translate3d\(888px, 588px, 0px\)/);
    assert.equal(dom.display, "");
    observed.setWindowActiveTab(1, 8);
    await overlay.republishTabState(7);
    assert.deepEqual(overlay.readCursorOverlayState(7).cursor, {
      visible: false,
      x: 900,
      y: 600,
    });
    await overlay.stopSession("session");
    assert.equal(signal.aborted, true);
    await overlay.finishRequest("session");
    assert.equal(overlay.isBrowserControlActive(), false);
    assert.equal(
      await page.evaluate(
        () =>
          (globalThis as any).overlayShadow.querySelector(
            ".codex-agent-overlay",
          ).style.display,
      ),
      "none",
    );
    assert.equal(injections, 1);
    assert.equal(handler.cursorArrivalWaitersByKey.size, 0);
    observed.dispose();
  } finally {
    await browser.close();
  }
});
