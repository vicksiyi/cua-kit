import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { contentBindingsSource } from "./extension-content-source";
import { compiledInjectedDeclarations } from "./injected-source";
const original = contentBindingsSource([
  "_e",
  "W",
  "Me",
  "vt",
  "Te",
  "be",
  "Ne",
  "St",
  "yt",
  "Ct",
  "xt",
  "q",
  "B",
  "Et",
  "Rt",
  "we",
  "It",
  "Ot",
  "_t",
  "At",
  "Mt",
  "De",
  "Tt",
  "Pe",
  "bt",
  "Nt",
  "wt",
  "Dt",
  "ie",
  "Fn",
  "Gn",
  "je",
  "Xe",
  "Un",
]);
const restored =
  (await compiledInjectedDeclarations(
    "packages/browser-extension/dist/content_runtime.js",
  )) +
  "\n" +
  (await compiledInjectedDeclarations(
    "packages/browser-extension/dist/favicon_badge_dom.js",
  ));
test("favicon DOM matches original in Chromium for SVG output, mutation preservation, restoration and messages", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(useOriginal: boolean, html: string) {
      const page = await browser.newPage();
      await page.setContent(html);
      await page.evaluate("globalThis.__name = (fn) => fn");
      await page.evaluate(
        ({ source, useOriginal }) => {
          const listeners: Function[] = [],
            events: any[] = [];
          const chrome = {
            runtime: {
              onMessage: { addListener: (fn: Function) => listeners.push(fn) },
            },
          };
          const Q = () => events.push("overlay");
          const body = useOriginal
            ? `${source};return {apply:Et,initialize:Un,guard:Gn};`
            : `${source};const badges=createFaviconBadgeDom({document,setTimeout});return {apply:badges.apply,initialize:createContentMessageInitializer({chrome,ensureOverlay:Q,badges}),guard:isFaviconBadgeMessage};`;
          const api = new Function("chrome", "Q", body)(chrome, Q);
          (window as any).test = { api, listeners, events };
        },
        { source: useOriginal ? original : restored, useOriginal },
      );
      const result = await page.evaluate(async () => {
        const { api, listeners, events } = (window as any).test;
        const snapshots: any[] = [];
        const snapshot = () =>
          snapshots.push(
            [...document.querySelectorAll("link")].map(
              (link) => link.outerHTML,
            ),
          );
        api.initialize();
        api.initialize();
        await api.apply("active", 'data:image/png;base64,AQID&"<>');
        snapshot();
        await api.apply("handoff", "data:image/png;base64,AQID");
        snapshot();
        const first = document.querySelector("link");
        if (first) first.setAttribute("href", "/page-changed.png");
        await api.apply(null, null);
        snapshot();
        await api.apply("deliverable", "data:image/png;base64,AQID");
        snapshot();
        const clearing = api.apply(null, null);
        snapshot();
        await clearing;
        snapshot();
        const pending = api.apply(null, null);
        await api.apply("active", "data:image/png;base64,AQID");
        await pending;
        snapshot();
        const responses: any[] = [];
        for (const message of [
          { type: "CONTENT_PING" },
          {
            type: "TAB_FAVICON_BADGE",
            badge: "handoff",
            faviconDataUrl: "data:image/png;base64,AQID",
          },
          { type: "TAB_FAVICON_BADGE", badge: null, faviconDataUrl: null },
          { type: "TAB_FAVICON_BADGE", badge: "bad", faviconDataUrl: "x" },
          { type: "unknown" },
        ]) {
          const replies: any[] = [];
          const returned = listeners[0](message, {}, (value: any) =>
            replies.push(value),
          );
          await new Promise((resolve) => setTimeout(resolve, 5));
          responses.push({ returned, replies });
          snapshot();
        }
        return {
          snapshots,
          responses,
          events,
          listenerCount: listeners.length,
        };
      });
      await page.close();
      return result;
    }
    for (const html of [
      '<head><link rel="icon" href="/original.ico"><link rel="shortcut icon"></head>',
      "<html><head></head><body></body></html>",
    ]) {
      const actual = await run(false, html);
      assert.deepEqual(actual, await run(true, html));
      assert.equal(actual.listenerCount, 1);
      assert.deepEqual(actual.events, ["overlay", "overlay"]);
      assert.ok(actual.snapshots[0][0].includes("codex-favicon-badge"));
      assert.deepEqual(actual.responses[0], {
        returned: true,
        replies: [{ ok: true }],
      });
    }
  } finally {
    await browser.close();
  }
});
