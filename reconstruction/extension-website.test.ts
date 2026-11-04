import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const original = await readFile(
  `${root}/content-scripts/chatgpt-website.js`,
  "utf8",
);
assert.equal(
  createHash("sha256").update(original).digest("hex"),
  "e3a115ecb20aa24abe417688a43b2ec01db85acae7e5af8e0188b46cce65a318",
);
const built = await readFile(
  "packages/browser-extension/dist/content-scripts/chatgpt-website.js",
  "utf8",
);
test("full website entry matches original status refresh/reconnect, trusted actions, runtime bridge and cleanup", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const source of [original, built]) {
      const page = await browser.newPage();
      await page.setContent(
        '<button id="panel" data-chatgpt-extension-action="open-side-panel" data-chatgpt-extension-prompt="hello"><span>Panel</span></button><button id="installer" data-chatgpt-extension-action="show-codex-installer">Installer</button>',
      );
      await page.evaluate(() => {
        const g = globalThis as any;
        g.__name = (fn: any) => fn;
        g.trace = [];
        g.ports = [];
        g.runtimeListeners = new Set();
        g.timers = new Map();
        g.timerId = 0;
        g.failConnect = false;
        g.failPost = false;
        window.setTimeout = ((fn: Function, delay: number) => {
          g.trace.push(["timer", delay]);
          const id = ++g.timerId;
          g.timers.set(id, fn);
          return id;
        }) as any;
        window.clearTimeout = ((id: number) => {
          g.timers.delete(id);
        }) as any;
        g.chrome = {
          runtime: {
            id: "fixture",
            getURL: (path: string) => `chrome-extension://fixture/${path}`,
            getManifest: () => ({ version: "fixture-version" }),
            onMessage: {
              addListener: (fn: Function) => g.runtimeListeners.add(fn),
              removeListener: (fn: Function) => g.runtimeListeners.delete(fn),
            },
            sendMessage(message: any) {
              g.trace.push(["send", message]);
              return Promise.resolve();
            },
            connect(options: any) {
              g.trace.push(["connect", options]);
              if (g.failConnect) throw Error("fixture unavailable");
              const port: any = {
                name: options.name,
                messages: new Set(),
                disconnected: new Set(),
                postMessage(message: any) {
                  g.trace.push(["post", message]);
                  if (g.failPost) throw Error("fixture closed");
                },
                disconnect() {
                  g.trace.push(["disconnect", g.ports.indexOf(port)]);
                  for (const fn of [...port.disconnected]) fn(port);
                },
              };
              port.onMessage = {
                addListener: (fn: Function) => port.messages.add(fn),
                removeListener: (fn: Function) => port.messages.delete(fn),
              };
              port.onDisconnect = {
                addListener: (fn: Function) => port.disconnected.add(fn),
                removeListener: (fn: Function) => port.disconnected.delete(fn),
              };
              g.ports.push(port);
              return port;
            },
          },
        };
        window.addEventListener("chatgpt-extension-status", () =>
          g.trace.push([
            "status",
            document.documentElement.getAttribute(
              "data-chatgpt-extension-status",
            ),
            document.documentElement.getAttribute(
              "data-chatgpt-extension-side-panel",
            ),
          ]),
        );
        window.addEventListener("chatgpt-extension-plugins-changed", () =>
          g.trace.push(["plugins"]),
        );
        g.reply = (port: any, status: any) => {
          for (const fn of [...port.messages]) fn({ status }, port);
        };
        g.disconnect = (port: any) => {
          for (const fn of [...port.disconnected]) fn(port);
        };
        g.flushTimers = () => {
          const pending = [...g.timers.values()];
          g.timers.clear();
          for (const fn of pending) fn();
        };
      });
      await page.evaluate(source + ";globalThis.startup=chatgptWebsite;");
      await page.evaluate(async () => {
        await (globalThis as any).startup;
      });
      await page.evaluate(() => {
        const g = globalThis as any;
        g.reply(g.ports[0], {
          browserContext: { instanceId: "profile" },
          state: 1,
        });
        g.reply(g.ports[0], { state: 2 });
        window.dispatchEvent(new Event("chatgpt-extension-request-status"));
        g.disconnect(g.ports[0]);
        g.flushTimers();
        g.reply(g.ports[1], { state: 3 });
        // No second reconnect until another refresh request.
        g.disconnect(g.ports[1]);
        g.flushTimers();
        window.dispatchEvent(new Event("chatgpt-extension-request-status"));
        g.failPost = true;
        window.dispatchEvent(new Event("chatgpt-extension-request-status"));
        g.failPost = false;
        g.flushTimers();
        g.disconnect(g.ports[3]);
        g.failConnect = true;
        window.dispatchEvent(new Event("chatgpt-extension-request-status"));
        g.flushTimers();
        if (g.timers.size !== 0) throw Error("unexpected endless retry");
        g.failConnect = false;
        window.dispatchEvent(new Event("chatgpt-extension-request-status"));
        for (const fn of g.runtimeListeners) {
          fn(
            { type: "CHATGPT_WEBSITE_BRIDGE_PING" },
            { id: "wrong" },
            (value: any) => g.trace.push(["ping", value]),
          );
          fn(
            { type: "CHATGPT_WEBSITE_BRIDGE_PING" },
            { id: "fixture" },
            (value: any) => g.trace.push(["ping", value]),
          );
          fn(
            { type: "CHATGPT_WEBSITE_PLUGINS_CHANGED" },
            { id: "fixture" },
            () => {},
          );
        }
        window.dispatchEvent(new Event("chatgpt-extension-settings-updated"));
        document
          .querySelector("#panel")!
          .dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
          );
      });
      await page.click("#panel span");
      await page.click("#installer");
      await page.evaluate(() => {
        const g = globalThis as any;
        Object.defineProperty(navigator, "userActivation", {
          configurable: true,
          value: { isActive: true },
        });
        for (const detail of [
          {
            type: "OPEN_CODEX_SIDE_PANEL",
            mode: "work",
            prompt: "question",
            source: "fixture",
          },
          { type: "OPEN_CODEX_SIDE_PANEL", mode: "bad" },
          { type: "OPEN_CODEX_SIDE_PANEL", prompt: 123 },
          { type: "SHOW_CODEX_INSTALLER" },
          { type: "other" },
        ]) {
          const event = new CustomEvent("chatgpt-extension-request-action", {
            detail,
            cancelable: true,
          });
          window.dispatchEvent(event);
          g.trace.push(["prevented", event.defaultPrevented]);
        }
        document.dispatchEvent(
          new CustomEvent(
            "fixture:chatgpt-website:wxt:content-script-started",
            {
              detail: {
                contentScriptName: "chatgpt-website",
                messageId: "another",
              },
            },
          ),
        );
        window.dispatchEvent(new Event("chatgpt-extension-request-status"));
        window.dispatchEvent(new Event("chatgpt-extension-settings-updated"));
      });
      results.push(
        await page.evaluate(() => ({
          trace: (globalThis as any).trace,
          runtimeListeners: (globalThis as any).runtimeListeners.size,
          timers: (globalThis as any).timers.size,
          status: document.documentElement.getAttribute(
            "data-chatgpt-extension-status",
          ),
        })),
      );
      await page.close();
    }
    assert.deepEqual(results[1], results[0]);
    assert.equal(results[1].runtimeListeners, 0);
    assert.equal(results[1].timers, 0);
    assert.equal(results[1].status, null);
    assert.equal(
      results[1].trace.filter((row: any) => row[0] === "connect").length,
      7,
    );
  } finally {
    await browser.close();
  }
});
