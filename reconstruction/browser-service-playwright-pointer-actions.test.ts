import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { PlaywrightPointerActions } from "../packages/browser/src/service/playwright/pointer_actions";
const original = originalServiceBindings([
  "ig",
  "Fo",
  "ng",
  "og",
  "ot",
  "Fr",
  "Tne",
  "Sne",
  "Ene",
  "xne",
  "No",
  "oS",
  "wF",
  "Pne",
  "vF",
  "SF",
  "nS",
  "Mo",
  "Ane",
  "hF",
  "Ms",
  "no",
  "vne",
  "eg",
  "gF",
  "W",
  "au",
  "qc",
  "rg",
  "Rne",
  "Ine",
  "iS",
  "kne",
  "Bne",
  "tS",
  "tg",
  "Ve",
  "eS",
  "EF",
  "sg",
  "Qv",
  "fl",
  "Dne",
  "_F",
  "rS",
  "Cne",
  "li",
  "b5",
  "gp",
  "xF",
]);

const injectedSource = new Function(`return (${serviceExpression("hF")})`)();
const span = {
  currentPlaywrightOperation(fallback: string) {
    return fallback;
  },
};
const timing = {
  startLocatorRetry() {
    return { finish() {}, attemptFailed() {} };
  },
};
function make(restored: boolean, cdp: any) {
  return restored
    ? new PlaywrightPointerActions(cdp, injectedSource, timing, span)
    : new original.ig(cdp, {}, span, timing);
}
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}
test("pointer orchestration preserves alignment retries, force and error/dispatch boundaries", async () => {
  for (const scenario of [
    "clear",
    "second",
    "blocked",
    "force",
    "resolve-error",
    "dispatch-error",
  ]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        service: any = make(restored, { addListener() {} });
      let count = 0;
      service.resolvePointerActionTarget = async (...args: any[]) => {
        calls.push(["resolve", ...args]);
        if (scenario === "resolve-error") throw Error("detached");
        return { point: { x: 1, y: 2 }, frameBoundaries: [] };
      };
      service.obstructingFrameHitTarget = async (...args: any[]) => {
        calls.push(["hit", ...args]);
        return scenario === "blocked" ||
          (scenario === "second" && count++ === 0)
          ? "<overlay>"
          : null;
      };
      const result = await outcome(() =>
        service.performPointerAction(
          { tab_id: 1, selector: "button", timeout_ms: 50 },
          {
            requiredStates: ["visible"],
            actionName: "click",
            force: scenario === "force",
            timeoutMs: 60,
            dispatch: async (target: any) => {
              calls.push(["dispatch", target]);
              if (scenario === "dispatch-error") throw Error("input failed");
            },
          },
        ),
      );
      return { result, calls };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("pointer page preparation preserves stable-rectangle polling and pre/post state checks", async () => {
  for (const scenario of [
    "stable",
    "moving",
    "settles",
    "negative",
    "zero",
    "disabled",
    "disconnect",
    "post-disabled",
    "timer",
    "raf",
  ]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        service: any = make(restored, { addListener() {} });
      let rects = 0,
        states = 0;
      const view: any =
        scenario === "timer"
          ? {
              setTimeout(callback: any, delay: number) {
                calls.push(["timer", delay]);
                queueMicrotask(callback);
              },
            }
          : scenario === "raf"
            ? {
                setTimeout() {
                  calls.push(["timeout"]);
                  return 1;
                },
                clearTimeout(id: any) {
                  calls.push(["clear", id]);
                },
                requestAnimationFrame(callback: any) {
                  calls.push(["raf"]);
                  queueMicrotask(callback);
                  return 2;
                },
              }
            : {};
      const element: any = {
        ownerDocument: { defaultView: view },
        scrollIntoView(options: any) {
          calls.push(["scroll", options]);
        },
        getBoundingClientRect() {
          rects++;
          calls.push(["rect", rects]);
          return {
            left:
              scenario === "negative"
                ? -100
                : scenario === "moving"
                  ? rects
                  : scenario === "settles"
                    ? Math.min(rects, 3)
                    : 10,
            top: 20,
            width: scenario === "zero" ? 0 : 40,
            height: 20,
          };
        },
      };
      const injected = {
        elementState(_element: any, state: string) {
          states++;
          calls.push(["state", state]);
          return {
            matches:
              scenario !== "disabled" &&
              !(scenario === "post-disabled" && states > 1),
            received:
              scenario === "disconnect" ? "error:notconnected" : undefined,
          };
        },
      };
      service.evaluateOnPlaywrightSelectorWithTarget = async (
        tab: any,
        selector: any,
        callback: any,
        options: any,
      ) => {
        calls.push(["evaluate", tab, selector, options]);
        return {
          result: await callback(element, injected, options.arg, {
            prepareFrameChainForPointerAction(point: any, alignment: any) {
              calls.push(["frame", point, alignment]);
              return point;
            },
          }),
          oopifFrameChain: [],
          target: { tabId: 1 },
        };
      };
      service.currentTopLevelPointForAction = async (...args: any[]) => {
        calls.push(["top", ...args]);
        return { point: args[0], frameBoundaries: [] };
      };
      return {
        result: await outcome(() =>
          service.resolvePointerActionTarget(
            { tab_id: 1, selector: "button", timeout_ms: 50 },
            { requiredStates: ["visible"] },
          ),
        ),
        calls,
      };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("assembled pointer preparation dispatches a real Chromium iframe click at the resolved coordinate", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage();
      try {
        await page.setContent(
          '<style>body{margin:0}iframe{position:absolute;left:40px;top:60px;width:200px;height:100px;border:0}</style><iframe srcdoc="<button onclick=window.clicked=true style=width:80px;height:30px>Child</button>"></iframe>',
        );
        await page.frameLocator("iframe").locator("button").waitFor();
        const session = await page.context().newCDPSession(page),
          cdp: any = {
            addListener() {},
            async callTarget(_target: any, method: string, params: any) {
              return session.send(method as any, params);
            },
          },
          service: any = make(restored, cdp);
        let point: any;
        await service.performPointerAction(
          {
            tab_id: 1,
            selector: "iframe >> internal:control=enter-frame >> button",
            timeout_ms: 1000,
          },
          {
            requiredStates: ["visible", "enabled"],
            actionName: "click",
            timeoutMs: 1000,
            dispatch: async (target: any) => {
              point = target.point;
              await session.send("Input.dispatchMouseEvent", {
                type: "mousePressed",
                x: point.x,
                y: point.y,
                button: "left",
                clickCount: 1,
              });
              await session.send("Input.dispatchMouseEvent", {
                type: "mouseReleased",
                x: point.x,
                y: point.y,
                button: "left",
                clickCount: 1,
              });
            },
          },
        );
        return {
          point,
          clicked: await page
            .frames()[1]
            .evaluate(() => (window as any).clicked),
        };
      } finally {
        await page.close();
      }
    }
    const actual = await run(true);
    assert.deepEqual(actual, await run(false));
    assert.equal(actual.clicked, true);
    assert.deepEqual(actual.point, { x: 88, y: 83 });
  } finally {
    await browser.close();
  }
});
