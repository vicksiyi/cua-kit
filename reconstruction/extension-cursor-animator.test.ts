import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { originalCursorAnimatorSource } from "./extension-cursor-source";
import { compiledInjectedDeclarations } from "./injected-source";
const restored = (
  await Promise.all(
    ["cursor_spring", "cursor_path", "cursor_motion", "cursor_animator"].map(
      (name) =>
        compiledInjectedDeclarations(
          `packages/browser-extension/dist/${name}.js`,
        ),
    ),
  )
).join("\n");
test("cursor animator matches original DOM, timed frames, arrival keys and destruction in Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(useOriginal: boolean, fallback: boolean) {
      const page = await browser.newPage();
      await page.setContent('<div id="container"></div>');
      await page.evaluate("globalThis.__name=(fn)=>fn");
      const result = await page.evaluate(
        ({ source, useOriginal, fallback }) => {
          let time = 0,
            nextId = 0;
          const callbacks = new Map<number, Function>(),
            trace: any[] = [],
            arrivals: number[] = [];
          const request = (fn: Function) => {
            const id = ++nextId;
            callbacks.set(id, fn);
            return id;
          };
          const window = {
            requestAnimationFrame: fallback ? undefined : request,
            cancelAnimationFrame: fallback
              ? undefined
              : (id: number) => callbacks.delete(id),
            setTimeout: request,
            clearTimeout: (id: number) => callbacks.delete(id),
          };
          const performance = { now: () => time };
          const factory = new Function(
            "window",
            "performance",
            `${source};return ${useOriginal ? "rn" : "(container, options) => createCursorAnimator({document,window,performance},container,options)"}`,
          )(window, performance);
          const container = document.getElementById("container")!;
          const animator = factory(container, {
            assetUrl: "data:image/png;base64,",
            glowColor: "#339cff",
            onArrived: (sequence: number) => arrivals.push(sequence),
          });
          const snapshot = () =>
            trace.push([container.innerHTML, [...arrivals], callbacks.size]);
          const set = (cursor: any, isVisible = true, turnKey = "s:t") => {
            animator.setState({
              cursor,
              isVisible,
              turnKey,
              viewportSize: { width: 1200, height: 800 },
            });
            snapshot();
          };
          const frames = (count: number) => {
            for (let frame = 0; frame < count; frame++) {
              time += frame === 12 ? 1500 : frame % 3 === 0 ? 8 : 17;
              const pending = [...callbacks];
              callbacks.clear();
              for (const [, callback] of pending) callback(time);
              snapshot();
            }
          };
          snapshot();
          set(null, false);
          frames(2);
          set(null);
          frames(120); // thinking turn starts once
          set(null);
          frames(2);
          set({ visible: true, x: 20, y: 30, moveSequence: 1 });
          frames(12);
          set({ visible: true, x: 1100, y: 700, moveSequence: 2 });
          frames(180); // retarget bezier
          set({ visible: true, x: 1100, y: 700, moveSequence: 2 });
          frames(2); // deduplicate
          set({ visible: true, x: 1150, y: 750, moveSequence: 3 });
          frames(180); // scoot
          set({
            visible: true,
            x: -100,
            y: 900,
            moveSequence: 4,
            animateMovement: false,
          });
          frames(3); // clamp and immediate
          set({ visible: false, x: 0, y: 800, moveSequence: 5 });
          frames(180);
          set(
            { visible: true, x: 200, y: 400, moveSequence: 2 },
            true,
            "s:next",
          );
          frames(180); // first hidden reveal for a new turn
          set({ visible: true, x: 900, y: 30, moveSequence: 6 });
          frames(4);
          animator.destroy();
          snapshot();
          const countBefore = arrivals.length;
          frames(4);
          return {
            trace,
            arrivals,
            countBefore,
            final: container.innerHTML,
            pending: callbacks.size,
          };
        },
        {
          source: useOriginal ? originalCursorAnimatorSource : restored,
          useOriginal,
          fallback,
        },
      );
      await page.close();
      return result;
    }
    for (const fallback of [false, true]) {
      const actual = await run(false, fallback);
      assert.deepEqual(actual, await run(true, fallback));
      assert.deepEqual(actual.arrivals, [2, 3, 4, 5, 2]);
      assert.equal(actual.pending, 0);
      assert.equal(actual.final, "");
      assert.equal(actual.countBefore, actual.arrivals.length);
    }
  } finally {
    await browser.close();
  }
});

// Exercise the production default composition, not the controller's test factory.
test("overlay controller drives restored animator and emits original arrival messages", async () => {
  const { contentBindingsSource } = await import("./extension-content-source");
  const originalController =
    originalCursorAnimatorSource +
    contentBindingsSource(["Ae", "bn", "Nn", "qe", "wn", "Dn", "Pn"]);
  const restoredController =
    restored +
    (await compiledInjectedDeclarations(
      "packages/browser-extension/dist/overlay_controller.js",
    ));
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(useOriginal: boolean) {
      const page = await browser.newPage();
      await page.setContent('<div id="container"></div>');
      await page.evaluate("globalThis.__name=(fn)=>fn");
      const result = await page.evaluate(
        ({ source, useOriginal }) => {
          let time = 0,
            id = 0;
          const frames = new Map<number, FrameRequestCallback>(),
            listeners = new Set<Function>(),
            sent: any[] = [],
            trace: any[] = [];
          const performance = { now: () => time };
          const window = {
            top: null,
            self: null,
            innerWidth: 1200,
            innerHeight: 800,
            performance,
            requestAnimationFrame(fn: FrameRequestCallback) {
              frames.set(++id, fn);
              return id;
            },
            cancelAnimationFrame(id: number) {
              frames.delete(id);
            },
            addEventListener() {},
            removeEventListener() {},
          };
          const chrome = {
            runtime: {
              getURL: (path: string) => `chrome-extension://fixture/${path}`,
              onMessage: {
                addListener: (fn: Function) => listeners.add(fn),
                removeListener: (fn: Function) => listeners.delete(fn),
              },
              sendMessage(message: any) {
                sent.push(message);
                return new Promise(() => {});
              },
            },
          };
          const render = new Function(
            "window",
            "performance",
            "chrome",
            `${source};return ${useOriginal ? "Dn" : "createOverlayController({document,window,chrome})"}`,
          )(window, performance, chrome);
          const container = document.getElementById("container")!,
            dispose = render(container);
          const snapshot = () =>
            trace.push([
              container.innerHTML,
              structuredClone(sent),
              frames.size,
            ]);
          const send = (x: number, y: number, sequence: number) => {
            for (const listener of listeners) {
              listener(
                {
                  type: "AGENT_CURSOR_STATE",
                  state: {
                    sessionId: "session",
                    turnId: "turn",
                    isVisible: true,
                    cursor: { visible: true, x, y, moveSequence: sequence },
                  },
                },
                {},
                (value: any) => trace.push(["reply", value]),
              );
            }
            snapshot();
          };
          const advance = () => {
            for (let i = 0; i < 180; i++) {
              time += 17;
              const pending = [...frames.values()];
              frames.clear();
              for (const fn of pending) fn(time);
              snapshot();
            }
          };
          snapshot();
          send(10, 20, 1);
          advance();
          send(1100, 700, 2);
          advance();
          send(1100, 700, 2);
          advance();
          dispose();
          snapshot();
          return {
            trace,
            sent,
            listeners: listeners.size,
            pending: frames.size,
            html: container.innerHTML,
          };
        },
        {
          source: useOriginal ? originalController : restoredController,
          useOriginal,
        },
      );
      await page.close();
      return result;
    }
    const actual = await run(false);
    assert.deepEqual(actual, await run(true));
    assert.deepEqual(actual.sent, [
      { type: "GET_AGENT_CURSOR_STATE" },
      {
        type: "AGENT_CURSOR_ARRIVED",
        moveSequence: 1,
        sessionId: "session",
        turnId: "turn",
      },
      {
        type: "AGENT_CURSOR_ARRIVED",
        moveSequence: 2,
        sessionId: "session",
        turnId: "turn",
      },
    ]);
    assert.equal(actual.listeners, 0);
    assert.equal(actual.pending, 0);
    assert.equal(actual.html, "");
  } finally {
    await browser.close();
  }
});
