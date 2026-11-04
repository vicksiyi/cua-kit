import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import {
  originalSideChatSource,
  sideChatBindingsSource,
} from "./extension-side-chat-source";
const original =
  sideChatBindingsSource([
    "f",
    "le",
    "O",
    "S",
    "E",
    "x",
    "w",
    "R",
    "P",
    "B",
    "h",
    "U",
    "L",
    "G",
    "H",
    "k",
    "V",
    "j",
    "W",
    "u",
    "b",
    "q",
    "X",
    "Y",
    "$",
    "F",
    "K",
    "Q",
    "J",
  ]) +
  ";globalThis.installSearch=W;globalThis.installMain=J.main;globalThis.originalCapabilities=L;";
const bundled = await build({
  entryPoints: ["packages/browser-extension/src/side_chat_mentions.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "SideChat",
  platform: "browser",
});
const restored =
  bundled.outputFiles[0].text +
  ";globalThis.SideChat=SideChat;globalThis.installSearch=(ctx,enabled)=>SideChat.installMentionSearchContent(ctx,{window,document,chrome,now:()=>Date.now()},enabled);globalThis.installMain=(ctx)=>SideChat.installSideChatMentions(ctx,{window,document,chrome});";
test("side-chat search content matches original trusted gesture, expiry, port ownership and DOM dispatch", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const outputs = [];
    for (const source of [original, restored]) {
      const page = await browser.newPage();
      await page.setContent('<button id="gesture">Gesture</button>');
      await page.evaluate(() => {
        const g = globalThis as any;
        g.__name = (fn: any) => fn;
        g.clock = 1000;
        Date.now = () => g.clock;
        g.trace = [];
        g.ports = [];
        g.invalidators = [];
        g.enabled = true;
        g.failConnect = false;
        g.chrome = {
          runtime: {
            connect(options: any) {
              g.trace.push(["connect", options]);
              if (g.failConnect) throw Error("unavailable");
              const port: any = {
                messages: [],
                disconnected: [],
                postMessage(value: any) {
                  g.trace.push(["post", value]);
                },
                disconnect() {
                  g.trace.push(["disconnect", g.ports.indexOf(port)]);
                  for (const fn of port.disconnected) fn();
                },
              };
              port.onMessage = {
                addListener: (fn: any) => port.messages.push(fn),
              };
              port.onDisconnect = {
                addListener: (fn: any) => port.disconnected.push(fn),
              };
              g.ports.push(port);
              return port;
            },
          },
        };
        g.ctx = {
          addEventListener(target: any, type: string, fn: any, options: any) {
            target.addEventListener(type, fn, options);
          },
          onInvalidated(fn: any) {
            g.invalidators.push(fn);
          },
        };
        window.addEventListener("chatgpt-extension-browser-tabs", () =>
          g.trace.push([
            "candidates",
            document.documentElement.getAttribute(
              "data-chatgpt-extension-browser-tabs",
            ),
          ]),
        );
        g.search = () =>
          window.dispatchEvent(
            new CustomEvent("chatgpt-extension-request-browser-tab-mentions", {
              detail: { query: "test", limit: 2 },
            }),
          );
      });
      await page.evaluate(source);
      await page.evaluate(() => {
        const g = globalThis as any;
        g.installSearch(g.ctx, () => g.enabled);
        g.search();
        document.dispatchEvent(new Event("click"));
        g.search();
      });
      await page.click("#gesture");
      await page.evaluate(() => {
        const g = globalThis as any;
        g.search();
        g.search();
        g.ports[0].messages[0]({ ok: true, candidates: [{ id: 1 }] });
      });
      await page.click("#gesture");
      await page.evaluate(() => {
        const g = globalThis as any;
        g.search();
        g.ports[0].messages[0]({ ok: true, candidates: ["stale"] });
        g.ports[1].disconnected[0]();
      });
      await page.click("#gesture");
      await page.evaluate(() => {
        const g = globalThis as any;
        g.clock += 5000;
        g.search();
      });
      await page.click("#gesture");
      await page.evaluate(() => {
        const g = globalThis as any;
        g.enabled = false;
        g.search();
        g.enabled = true;
        g.failConnect = true;
        g.search();
        g.failConnect = false;
      });
      await page.click("#gesture");
      await page.evaluate(() => {
        const g = globalThis as any;
        g.search();
        g.ports.at(-1).messages[0]({ ok: false });
        for (const fn of g.invalidators) fn();
        g.ports.at(-1).messages[0]({ ok: true, candidates: ["late"] });
      });
      outputs.push(
        await page.evaluate(() => ({
          trace: (globalThis as any).trace,
          attribute: document.documentElement.getAttribute(
            "data-chatgpt-extension-browser-tabs",
          ),
        })),
      );
      await page.close();
    }
    assert.deepEqual(outputs[1], outputs[0]);
    assert.equal(outputs[1].attribute, null);
    assert.equal(
      outputs[1].trace.filter((row: any) => row[0] === "connect").length,
      4,
    );
  } finally {
    await browser.close();
  }
});
test("side-chat main preserves parent capability handshake and invalidation under explicit host fixtures", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const outputs = [];
    for (const source of [original, restored]) {
      const page = await browser.newPage();
      await page.setContent("<html></html>");
      await page.evaluate(source);
      outputs.push(
        await page.evaluate(() => {
          const g = globalThis as any;
          g.__name = (fn: any) => fn;
          const trace: any[] = [],
            listeners = new Map<string, Function[]>(),
            invalidators: Function[] = [];
          // Fixtures explicitly model extension ancestry and trusted parent message metadata.
          const fakeWindow: any = {
            location: { ancestorOrigins: ["chrome-extension://fixture"] },
            parent: {
              postMessage: (...args: any[]) => trace.push(["request", ...args]),
            },
            dispatchEvent: (event: Event) =>
              trace.push([
                "event",
                event.type,
                document.documentElement.getAttribute(
                  "data-chatgpt-extension-status",
                ),
              ]),
          };
          const ctx = {
            addEventListener(_target: any, type: string, fn: Function) {
              if (!listeners.has(type)) listeners.set(type, []);
              listeners.get(type)!.push(fn);
            },
            onInvalidated(fn: Function) {
              invalidators.push(fn);
            },
          };
          const chrome: any = { runtime: { id: "fixture" }, extension: {} };
          const emit = (type: string, value: any) => {
            for (const fn of listeners.get(type) ?? []) fn(value);
          };
          if (g.SideChat)
            g.SideChat.installSideChatMentions(ctx, {
              window: fakeWindow,
              document,
              chrome,
            });
          else {
            // Re-evaluate inspected main with its window/chrome globals replaced, leaving DOM publication real.
            const main = new Function(
              "window",
              "chrome",
              "document",
              "W",
              "L",
              "h",
              "S",
              "E",
              "O",
              "x",
              `return (function ${g.installMain.toString()});`,
            )(
              fakeWindow,
              chrome,
              document,
              g.installSearch,
              g.originalCapabilities,
              { browserTabMentionsSearch: "browserTabMentions.search" },
              "data-chatgpt-extension-status",
              "chatgpt-extension-status",
              "browser_side_chat_capabilities_requested",
              "chatgpt-extension-request-status",
            );
            main(ctx);
          }
          const message = {
            isTrusted: true,
            source: fakeWindow.parent,
            origin: "chrome-extension://fixture",
            data: {
              type: "browser_side_chat_capabilities",
              browserContext: { instanceId: null },
              capabilities: { "browserTabMentions.search": true },
            },
          };
          emit("message", { ...message, isTrusted: false });
          emit("message", { ...message, origin: "https://wrong.test" });
          emit("message", message);
          emit("chatgpt-extension-request-status", {});
          for (const fn of invalidators) fn();
          return trace;
        }),
      );
      await page.close();
    }
    assert.deepEqual(outputs[1], outputs[0]);
  } finally {
    await browser.close();
  }
});

test("full side-chat bundle reuses WXT entry lifecycle and remains inert outside extension ancestry", async () => {
  const built = await readFile(
    "packages/browser-extension/dist/content-scripts/side-chat-tab-mentions.js",
    "utf8",
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const source of [originalSideChatSource, built]) {
      const page = await browser.newPage();
      await page.setContent("<html></html>");
      await page.evaluate(() => {
        const g = globalThis as any;
        g.trace = [];
        g.__name = (fn: any) => fn;
        Math.random = () => 0.5;
        g.chrome = {
          runtime: {
            id: "fixture",
            getURL: (path: string) => `chrome-extension://fixture/${path}`,
          },
          extension: {},
        };
        document.addEventListener(
          "fixture:side-chat-tab-mentions:wxt:content-script-started",
          (event: any) => g.trace.push(["start", event.detail]),
        );
        window.addEventListener("chatgpt-extension-status", () =>
          g.trace.push(["status"]),
        );
      });
      await page.evaluate(
        source + ";globalThis.entryPromise=sideChatTabMentions;",
      );
      await page.evaluate(async () => {
        await (globalThis as any).entryPromise;
      });
      results.push(
        await page.evaluate(() => ({
          trace: (globalThis as any).trace,
          status: document.documentElement.getAttribute(
            "data-chatgpt-extension-status",
          ),
        })),
      );
      await page.close();
    }
    assert.deepEqual(results[1], results[0]);
    assert.equal(results[1].status, null);
  } finally {
    await browser.close();
  }
});
