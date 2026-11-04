import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { contentBindingsSource } from "./extension-content-source";
const original =
  contentBindingsSource([
    "ee",
    "kn",
    "$n",
    "Ze",
    "ue",
    "Je",
    "Yn",
    "Wn",
    "qn",
  ]) + ";globalThis.WxtContext=qn";
const built = await build({
  stdin: {
    contents:
      'import { ContentScriptContext } from "wxt/utils/content-script-context"; globalThis.WxtContext=ContentScriptContext;',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  define: {
    "import.meta.env.ENTRYPOINT": '"codex"',
    "import.meta.env.MODE": '"production"',
  },
});
const upstream = built.outputFiles[0].text;
test("upstream WXT context matches original invalidation, timers and navigation/polling watchers", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(
      source: string,
      navigationSupported: boolean,
      preferBrowser: boolean,
    ) {
      const page = await browser.newPage();
      await page.route("http://fixture.test/**", (route) =>
        route.fulfill({ body: "<html></html>", contentType: "text/html" }),
      );
      await page.goto("http://fixture.test/");
      await page.evaluate("globalThis.__name=(fn)=>fn");
      const result = await page.evaluate(
        ({ source, navigationSupported, preferBrowser }) => {
          const trace: any[] = [],
            timers = new Map<number, Function>(),
            events = new EventTarget();
          let id = 0,
            random = 0;
          Math.random = () => ++random / 10;
          (globalThis as any).chrome = { runtime: { id: "chrome-fixture" } };
          (globalThis as any).browser = preferBrowser
            ? { runtime: { id: "browser-fixture" } }
            : undefined;
          const runtime = preferBrowser
            ? (globalThis as any).browser.runtime
            : (globalThis as any).chrome.runtime;
          const namespace = `${runtime.id}:codex:`;
          Object.defineProperty(globalThis, "navigation", {
            configurable: true,
            value: navigationSupported ? events : undefined,
          });
          const install =
            (name: string) => (callback: Function, timeout?: number) => {
              const handle = ++id;
              timers.set(handle, callback);
              trace.push([name, handle, timeout]);
              return handle;
            };
          const clear = (name: string) => (handle: number) => {
            timers.delete(handle);
            trace.push([name, handle]);
          };
          globalThis.setTimeout = install("timeout") as any;
          globalThis.setInterval = install("interval") as any;
          globalThis.clearTimeout = clear("clear-timeout");
          globalThis.clearInterval = clear("clear-interval");
          globalThis.requestAnimationFrame = install("frame") as any;
          globalThis.cancelAnimationFrame = clear("cancel-frame");
          globalThis.requestIdleCallback = install("idle") as any;
          globalThis.cancelIdleCallback = clear("cancel-idle");
          window.postMessage = ((value: any, target: string) =>
            trace.push(["post", value, target])) as any;
          document.addEventListener(
            namespace + "wxt:content-script-started",
            (event: any) => trace.push(["start", event.detail]),
          );
          new Function(source)();
          const Context = (globalThis as any).WxtContext;
          const a = new Context("codex", { matches: ["<all_urls>"] });
          trace.push(["created", Object.keys(a), a.isValid, a.signal.aborted]);
          a.onInvalidated(() => trace.push(["invalidated", a.signal.reason]));
          const remove = a.onInvalidated(() => trace.push(["should-not-run"]));
          remove();
          a.setTimeout(() => trace.push(["timeout-called"]), 42);
          a.setInterval(() => trace.push(["interval-called"]), 100);
          a.requestAnimationFrame((value: number) =>
            trace.push(["frame-called", value]),
          );
          a.requestIdleCallback(
            (value: any) => trace.push(["idle-called", value]),
            { timeout: 11 },
          );
          a.addEventListener(window, "custom", () => trace.push(["custom"]));
          a.addEventListener(window, "wxt:locationchange", (event: any) =>
            trace.push(["location", event.oldUrl.href, event.newUrl.href]),
          );
          // Register twice: the location watcher must still run only once.
          a.addEventListener(window, "wxt:locationchange", () =>
            trace.push(["location-2"]),
          );
          window.dispatchEvent(new Event("custom"));
          for (const fn of [...timers.values()]) fn(17);
          if (navigationSupported) {
            const event = new Event("navigate");
            Object.defineProperty(event, "destination", {
              value: { url: "http://fixture.test/next" },
            });
            events.dispatchEvent(event);
            events.dispatchEvent(event);
          } else {
            history.pushState({}, "", "/next");
            for (const fn of [...timers.values()]) fn(18);
          }
          const type = namespace + "wxt:content-script-started";
          document.dispatchEvent(
            new CustomEvent(type, {
              detail: { contentScriptName: "codex", messageId: a.id },
            }),
          );
          document.dispatchEvent(
            new CustomEvent(type, {
              detail: { contentScriptName: "other", messageId: "foreign" },
            }),
          );
          trace.push(["before-replacement", a.isValid]);
          const b = new Context("codex", {});
          trace.push(["replaced", a.isInvalid, b.isValid, timers.size]);
          window.dispatchEvent(new Event("custom"));
          delete runtime.id;
          trace.push(["missing-runtime", b.isInvalid, b.signal.reason]);
          return trace;
        },
        { source, navigationSupported, preferBrowser },
      );
      await page.close();
      return result;
    }
    for (const navigationSupported of [false, true])
      for (const preferBrowser of [false, true]) {
        const actual = await run(upstream, navigationSupported, preferBrowser);
        assert.deepEqual(
          actual,
          await run(original, navigationSupported, preferBrowser),
        );
        assert.ok(actual.some((row) => row[0] === "location"));
        assert.equal(actual.filter((row) => row[0] === "custom").length, 1);
        assert.deepEqual(
          actual.find((row) => row[0] === "replaced"),
          ["replaced", true, true, 0],
        );
        assert.equal(
          actual.some((row) => row[0] === "should-not-run"),
          false,
        );
      }
  } finally {
    await browser.close();
  }
});
