import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { contentBindingsSource } from "./extension-content-source";
import { compiledInjectedDeclarations } from "./injected-source";
import {
  parseCursorState,
  parseOverlayState,
} from "../packages/browser-extension/src/overlay_controller";
const guards = new Function(
  contentBindingsSource(["Ae", "qe", "wn"]) + ";return {qe,wn}",
)();
test("overlay state normalization preserves original cursor constraints and session visibility", () => {
  const cursors = [
    null,
    undefined,
    0,
    {},
    [],
    { visible: true, x: 1, y: 2 },
    { visible: false, x: NaN, y: 1 },
    { visible: true, x: 0, y: Infinity },
    { visible: true, x: -1, y: 2, moveSequence: -3, animateMovement: false },
    { visible: true, x: 0, y: 0, moveSequence: 1.5, animateMovement: "yes" },
  ];
  for (const cursor of cursors) {
    assert.deepEqual(parseCursorState(cursor), guards.wn(cursor));
    for (const sessionId of [null, undefined, "", "s", 1])
      for (const turnId of [null, "t", 7])
        for (const isVisible of [true, false, 1]) {
          const state = { cursor, sessionId, turnId, isVisible };
          assert.deepEqual(parseOverlayState(state), guards.qe(state));
        }
  }
  for (const state of [null, undefined, false, [], {}])
    assert.deepEqual(parseOverlayState(state), guards.qe(state));
});
const original = contentBindingsSource([
  "Ae",
  "bn",
  "Nn",
  "qe",
  "wn",
  "Dn",
  "Pn",
]);
const restored = await compiledInjectedDeclarations(
  "packages/browser-extension/dist/overlay_controller.js",
);
test("overlay controller matches original renderer boundary, messages, stale replies and disposal in top/subframes", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(useOriginal: boolean, child: boolean) {
      const page = await browser.newPage({
        viewport: { width: 800, height: 600 },
      });
      await page.setContent(
        '<div id="container"></div><iframe srcdoc="<div id=container></div>"></iframe>',
      );
      const frame = child ? page.frames()[1] : page.mainFrame();
      await frame.evaluate("globalThis.__name=(fn)=>fn");
      const result = await frame.evaluate(
        async ({ source, useOriginal }) => {
          const events: any[] = [],
            pending: Array<(value: any) => void> = [],
            listeners = new Set<Function>();
          let arrived: ((sequence: number) => void) | undefined;
          const chrome = {
            runtime: {
              getURL: (path: string) => `chrome-extension://fixture/${path}`,
              onMessage: {
                addListener(fn: Function) {
                  events.push(["listen+"]);
                  listeners.add(fn);
                },
                removeListener(fn: Function) {
                  events.push(["listen-"]);
                  listeners.delete(fn);
                },
              },
              sendMessage(message: any) {
                events.push(["send", message]);
                if (message.type === "GET_AGENT_CURSOR_STATE")
                  return new Promise((resolve) => pending.push(resolve));
                return Promise.resolve({ ok: true });
              },
            },
          };
          const rn = (element: HTMLElement, options: any) => {
            arrived = options.onArrived;
            events.push([
              "animator",
              element.outerHTML,
              options.assetUrl,
              options.glowColor,
            ]);
            return {
              setState(state: any) {
                events.push(["state", state]);
              },
              destroy() {
                events.push(["destroy"]);
              },
            };
          };
          const render = new Function(
            "chrome",
            "rn",
            useOriginal
              ? `${source};return Dn`
              : `${source};return createOverlayController({document,window,chrome,createAnimator:rn})`,
          )(chrome, rn);
          const container = document.getElementById("container")!,
            dispose = render(container);
          const flush = async () => {
            await Promise.resolve();
            await Promise.resolve();
          };
          const state = (sessionId: string) => ({
            sessionId,
            turnId: "t",
            isVisible: true,
            cursor: { visible: true, x: 10, y: 20, moveSequence: 3 },
          });
          arrived?.(0);
          const reply: any[] = [];
          const handler = [...listeners][0];
          const returned = handler(
            { type: "AGENT_CURSOR_STATE", state: state("live") },
            {},
            (value: any) => reply.push(value),
          );
          pending.shift()!({ ok: true, state: state("stale") });
          await flush();
          arrived?.(3);
          window.dispatchEvent(new Event("resize"));
          window.visualViewport?.dispatchEvent(new Event("resize"));
          window.dispatchEvent(new Event("pageshow"));
          window.dispatchEvent(new Event("pageshow"));
          const old = pending.shift()!,
            latest = pending.shift()!;
          latest({ ok: true, state: state("latest") });
          old({ ok: true, state: state("older") });
          await flush();
          arrived?.(4);
          const html = container.innerHTML;
          window.dispatchEvent(new Event("pageshow"));
          const afterDispose = pending.shift()!;
          dispose();
          afterDispose({ ok: true, state: state("disposed") });
          await flush();
          window.dispatchEvent(new Event("resize"));
          window.dispatchEvent(new Event("pageshow"));
          return {
            events,
            reply,
            returned,
            html,
            after: container.innerHTML,
            listeners: listeners.size,
            pending: pending.length,
          };
        },
        { source: useOriginal ? original : restored, useOriginal },
      );
      await page.close();
      return result;
    }
    for (const child of [false, true]) {
      const actual = await run(false, child);
      assert.deepEqual(actual, await run(true, child));
      assert.equal(actual.after, "");
      assert.equal(actual.listeners, 0);
      assert.equal(actual.pending, 0);
      assert.deepEqual(actual.reply, [{ ok: !child }]);
      const states = actual.events.filter((event) => event[0] === "state");
      assert.equal(
        states.some(
          (event) =>
            event[1].turnKey === "stale:t" || event[1].turnKey === "disposed:t",
        ),
        false,
      );
    }
  } finally {
    await browser.close();
  }
});
