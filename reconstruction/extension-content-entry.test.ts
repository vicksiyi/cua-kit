import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { originalContentScriptSource } from "./extension-content-source";
const restored = await readFile(
  "packages/browser-extension/dist/content-scripts/codex.js",
  "utf8",
);
test("complete bundled content entry matches original startup, shadow DOM, messages and reinjection", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(source: string, child: boolean) {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 800 },
      });
      await page.route("http://fixture.test/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<html><head><link rel="icon" href="/icon.png"></head><body><iframe srcdoc="<html><head></head><body></body></html>"></iframe></body></html>',
        }),
      );
      await page.goto("http://fixture.test/");
      const frame = child ? page.frames()[1] : page.mainFrame();
      await frame.evaluate("globalThis.__name=(fn)=>fn");
      const result = await frame.evaluate(async (source) => {
        let now = 0,
          id = 0,
          random = 0;
        const frames = new Map<number, FrameRequestCallback>(),
          timers = new Map<number, Function>(),
          listeners = new Set<Function>(),
          shadows: ShadowRoot[] = [],
          messages: any[] = [],
          starts: any[] = [],
          trace: any[] = [];
        Math.random = () => ++random / 10;
        Object.defineProperty(performance, "now", { value: () => now });
        window.requestAnimationFrame = (fn) => {
          frames.set(++id, fn);
          return id;
        };
        window.cancelAnimationFrame = (id) => {
          frames.delete(id);
        };
        window.setTimeout = ((fn: Function) => {
          timers.set(++id, fn);
          return id;
        }) as any;
        window.clearTimeout = (id) => {
          timers.delete(id);
        };
        const attachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (options) {
          const root = attachShadow.call(this, options);
          shadows.push(root);
          return root;
        };
        const eventName = "fixture:codex:wxt:content-script-started";
        document.addEventListener(eventName, (event: any) =>
          starts.push(["document", event.detail]),
        );
        window.postMessage = ((value: any, target: string) =>
          starts.push(["post", value, target])) as any;
        (globalThis as any).chrome = {
          runtime: {
            id: "fixture",
            getURL: (path: string) => `chrome-extension://fixture/${path}`,
            onMessage: {
              addListener: (fn: Function) => listeners.add(fn),
              removeListener: (fn: Function) => listeners.delete(fn),
            },
            sendMessage: (value: any) => {
              messages.push(value);
              return Promise.resolve({ ok: true, state: { isVisible: false } });
            },
          },
        };
        const flush = async () => {
          for (let i = 0; i < 6; i++) await Promise.resolve();
        };
        const snapshot = () =>
          trace.push({
            root:
              document.getElementById("codex-agent-overlay-root")?.outerHTML ??
              null,
            shadows: shadows.map((root) => [
              root.host.isConnected,
              root.innerHTML,
            ]),
            icons: Array.from(document.querySelectorAll("link")).map(
              (link) => link.outerHTML,
            ),
            messages: structuredClone(messages),
            starts: structuredClone(starts),
            listeners: listeners.size,
            frames: frames.size,
          });
        const send = async (message: any) => {
          const replies: any[] = [],
            returns: any[] = [];
          for (const listener of [...listeners])
            returns.push(
              listener(message, {}, (value: any) => replies.push(value)),
            );
          await flush();
          trace.push({ replies, returns });
          snapshot();
          return replies;
        };
        const advance = async (count: number) => {
          for (let i = 0; i < count; i++) {
            now += 17;
            const current = [...frames.values()];
            frames.clear();
            for (const fn of current) fn(now);
            await flush();
            snapshot();
          }
        };
        const start = async () => {
          const pending = new Function(source + ";return codex")();
          trace.push({ promise: pending instanceof Promise });
          await pending;
          await flush();
          snapshot();
        };
        await start();
        await send({ type: "CONTENT_PING" });
        await send({
          type: "TAB_FAVICON_BADGE",
          badge: "active",
          faviconDataUrl: "data:image/png;base64,AQID",
        });
        await send({
          type: "AGENT_CURSOR_STATE",
          state: {
            sessionId: "s",
            turnId: "t",
            isVisible: true,
            cursor: { x: 10, y: 20, visible: true, moveSequence: 1 },
          },
        });
        await advance(5);
        await send({
          type: "AGENT_CURSOR_STATE",
          state: {
            sessionId: "s",
            turnId: "t",
            isVisible: true,
            cursor: { x: 900, y: 600, visible: true, moveSequence: 2 },
          },
        });
        await advance(180);
        await send({
          type: "TAB_FAVICON_BADGE",
          badge: null,
          faviconDataUrl: null,
        });
        for (const [timer, fn] of [...timers]) {
          timers.delete(timer);
          fn();
        }
        await flush();
        snapshot();
        await start(); // Original context invalidation does not dispose Un's message listener.
        const pingAfterReinject = await send({ type: "CONTENT_PING" });
        document.getElementById("codex-agent-overlay-root")!.remove();
        await flush();
        snapshot();
        await send({ type: "CONTENT_PING" }); // Suppression must keep the removed overlay absent.
        return {
          trace,
          pingAfterReinject,
          finalRoot:
            document.getElementById("codex-agent-overlay-root")?.outerHTML ??
            null,
          starts,
          messages,
        };
      }, source);
      await page.close();
      return result;
    }
    for (const child of [false, true]) {
      const actual = await run(restored, child),
        original = await run(originalContentScriptSource, child);
      assert.deepEqual(actual, original);
      assert.equal(actual.finalRoot, null);
      assert.equal(actual.starts.length, 4);
      assert.deepEqual(actual.pingAfterReinject, [{ ok: true }, { ok: true }]);
      const arrived = actual.messages.filter(
        (message) => message.type === "AGENT_CURSOR_ARRIVED",
      );
      assert.deepEqual(
        arrived.map((message) => message.moveSequence),
        child ? [] : [1, 2],
      );
    }
  } finally {
    await browser.close();
  }
});
