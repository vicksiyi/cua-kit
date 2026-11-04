import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { chromium } from "playwright";
import { extensionBindings } from "./extension-source";
import { compiledInjectedDeclarations } from "./injected-source";
const root =
  process.env.CUA_EXTENSION_SOURCE_ROOT ??
  `${homedir()}/Library/Application Support/Google/Chrome/Default/Extensions/hehggadaopoacecdllhhajmbjkdcmajg/1.26.1102.11740_0`;
const originalEntry = await readFile(
  `${root}/content-scripts/foreign-frame-monitor.js`,
  "utf8",
);
assert.equal(
  createHash("sha256").update(originalEntry).digest("hex"),
  "337ad4ff3ec7846134e5d39528936b1cbb68107de3c4da0e0641c712bda66129",
);
const restoredEntry = await readFile(
  "packages/browser-extension/dist/content-scripts/foreign-frame-monitor.js",
  "utf8",
);
const original = extensionBindings(["jy", "tS", "Xy"], {
  Ia: "__codexForeignExtensionFrameMonitor",
});
const restored = await compiledInjectedDeclarations(
  "packages/browser-extension/dist/foreign_frame_dom.js",
);
test("foreign-frame DOM and complete entry match original for shadow roots, mutation, cleanup and reinjection", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(
      useOriginal: boolean,
      shadowMode: string,
      completeEntry: boolean,
    ) {
      const page = await browser.newPage();
      await page.route("**/*", (route) =>
        route.fulfill({ body: "<html></html>", contentType: "text/html" }),
      );
      await page.goto("http://fixture.test/");
      await page.evaluate("globalThis.__name=(fn)=>fn");
      const result = await page.evaluate(
        async ({
          source,
          helperSource,
          useOriginal,
          shadowMode,
          completeEntry,
        }) => {
          const key = "__codexForeignExtensionFrameMonitor",
            closed = new Map<Element, ShadowRoot>(),
            roots: ShadowRoot[] = [],
            starts: any[] = [],
            snapshots: any[] = [];
          let random = 0;
          Math.random = () => ++random / 10;
          window.postMessage = ((message: any, target: string) =>
            starts.push([message, target])) as any;
          (globalThis as any).chrome = {
            runtime: { id: "own" },
            dom:
              shadowMode === "absent"
                ? undefined
                : {
                    openOrClosedShadowRoot(element: Element) {
                      if (shadowMode === "throw") throw Error("unavailable");
                      return closed.get(element) ?? element.shadowRoot;
                    },
                  },
          };
          const frame = (id: string, src: string) => {
            const el = document.createElement("iframe");
            el.id = id;
            el.setAttribute("src", src);
            return el;
          };
          const host = document.createElement("div");
          host.id = "host";
          document.body.append(host);
          for (const mode of ["open", "closed"] as const) {
            const element = document.createElement("div");
            host.append(element);
            const root = element.attachShadow({ mode });
            closed.set(element, root);
            roots.push(root);
            root.append(
              frame(`${mode}-foreign`, "chrome-extension://foreign/view"),
            );
          }
          document.body.append(
            frame("foreign", "  chrome-extension://foreign/view  "),
            frame("own", "chrome-extension://own/view"),
            frame("web", "https://site.test/"),
            frame("upper", "CHROME-EXTENSION://foreign/view"),
          );
          const legacy = document.createElement("frame");
          legacy.setAttribute("src", "chrome-extension://foreign/legacy");
          document.body.append(legacy);
          const methods = new Function(
            helperSource +
              `;return ${useOriginal ? "{install:jy,remove:tS,present:Xy}" : "{install:installForeignFrameMonitor,remove:removeForeignFrameMonitor,present:hasForeignFrameMonitor}"}`,
          )();
          // Chrome serializes func: ensure the restored installer has no module closure dependencies.
          const install = new Function(
            `return (${methods.install.toString()})`,
          )();
          const flush = async () => {
            for (let i = 0; i < 8; i++) await Promise.resolve();
          };
          const snapshot = () =>
            snapshots.push({
              body: document.body.innerHTML,
              shadows: roots.map((root) => root.innerHTML),
              present: methods.present(key),
              starts: structuredClone(starts),
            });
          const start = async () => {
            if (completeEntry)
              await new Function(source + ";return foreignFrameMonitor")();
            else install(key);
            await flush();
            snapshot();
          };
          await start();
          const firstState = (globalThis as any)[key];
          await start();
          const sameState = firstState === (globalThis as any)[key];
          const dynamic = frame(
            "dynamic",
            "chrome-extension://foreign/dynamic",
          );
          document.body.append(dynamic);
          roots[0].append(
            frame("nested-new", "chrome-extension://foreign/nested"),
          );
          document
            .getElementById("own")!
            .setAttribute("src", "chrome-extension://foreign/changed");
          await flush();
          snapshot();
          const base = document.createElement("base");
          base.href = "chrome-extension://foreign/";
          document.head.append(base);
          document.body.append(frame("relative", "view"));
          await flush();
          snapshot();
          base.remove();
          methods.remove(key);
          snapshot();
          dynamic.removeAttribute("srcdoc");
          dynamic.setAttribute(
            "src",
            "chrome-extension://foreign/after-remove",
          );
          await flush();
          snapshot();
          const afterRemove = dynamic.getAttribute("srcdoc");
          await start();
          const afterRestart = dynamic.getAttribute("srcdoc");
          methods.remove(key);
          return {
            snapshots,
            sameState,
            afterRemove,
            afterRestart,
            foreign: document.getElementById("foreign")!.getAttribute("srcdoc"),
            web: document.getElementById("web")!.getAttribute("srcdoc"),
            closed: roots[1].querySelector("iframe")!.getAttribute("srcdoc"),
          };
        },
        {
          source: useOriginal ? originalEntry : restoredEntry,
          helperSource: useOriginal
            ? `const jy=${original.jy.toString()}; const tS=${original.tS.toString()}; const Xy=${original.Xy.toString()};`
            : restored,
          useOriginal,
          shadowMode,
          completeEntry,
        },
      );
      await page.close();
      return result;
    }
    for (const mode of ["absent", "throw", "available"])
      for (const completeEntry of [false, true]) {
        const actual = await run(false, mode, completeEntry);
        assert.deepEqual(actual, await run(true, mode, completeEntry));
        assert.equal(actual.sameState, true);
        assert.equal(actual.foreign, "");
        assert.equal(actual.web, null);
        assert.equal(actual.afterRemove, null);
        assert.equal(actual.afterRestart, "");
        assert.equal(actual.closed, mode === "available" ? "" : null);
      }
  } finally {
    await browser.close();
  }
});
