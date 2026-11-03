import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { PlaywrightLocatorEvaluation } from "../packages/browser/src/service/playwright/locator_evaluation";
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
function make(restored: boolean, cdp: any, tracker: any = timing) {
  return restored
    ? new PlaywrightLocatorEvaluation(cdp, injectedSource, tracker, span)
    : new original.ig(cdp, {}, span, tracker);
}
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as any).message, code: (e as any).code };
  }
}
test("locator evaluation preserves bound matching, page expression, options and retry telemetry", async () => {
  const clock = Date.now,
    timer = globalThis.setTimeout;
  try {
    for (const scenario of [
      "plain",
      "all",
      "retry",
      "strict",
      "isolated",
      "missing-frame",
      "bound",
      "bound-null",
      "bound-strict",
      "bound-world",
      "bound-error",
      "different-selector",
      "different-tab",
      "value",
    ]) {
      async function run(restored: boolean) {
        let time = 1000,
          attempt = 0;
        Date.now = () => time;
        const calls: any[] = [];
        globalThis.setTimeout = ((callback: any, delay: number) => {
          calls.push(["sleep", delay]);
          time += delay;
          callback();
          return 0;
        }) as any;
        const tracker = {
          startLocatorRetry() {
            calls.push(["start"]);
            return {
              finish(status: string) {
                calls.push(["finish", status]);
              },
              attemptFailed() {
                calls.push(["failed"]);
              },
            };
          },
        };
        const service: any = make(restored, { addListener() {} }, tracker);
        if (scenario.startsWith("bound") || scenario.startsWith("different"))
          service.boundSelector = {
            selector: scenario === "different-selector" ? "other" : "button",
            target: { tabId: scenario === "different-tab" ? 2 : 1 },
            executionContextId: scenario === "bound-world" ? undefined : 17,
            objectId: "node",
            oopifFrameChain: [],
          };
        service.callCdpTarget = async (...args: any[]) => {
          calls.push(["cdp", ...args]);
          return args[1] === "Page.getFrameTree"
            ? {
                frameTree: {
                  frame: scenario === "missing-frame" ? {} : { id: "root" },
                },
              }
            : scenario === "bound-error"
              ? { exceptionDetails: { text: "failed" } }
              : { result: { value: "bound" } };
        };
        service.evaluateSingleSelectorWithTarget = async (...args: any[]) => {
          calls.push(["single", ...args]);
          if (scenario === "retry" && attempt++ === 0) throw Error("not found");
          return {
            result: "single",
            target: args[0].target,
            oopifFrameChain: [],
          };
        };
        service.evaluateSelectorAllInTarget = async (...args: any[]) => {
          calls.push(["all", ...args]);
          return ["all"];
        };
        const options: any = {
          arg: scenario === "bound-null" ? null : { a: 1 },
          timeoutMs: 200,
          includeFrameIdentity: true,
          scrollFrameIntoView: false,
        };
        if (scenario === "strict" || scenario === "bound-strict")
          options.strict = true;
        if (["isolated", "missing-frame", "bound-world"].includes(scenario))
          options.isolatedWorld = true;
        const callback = function (element: any, injected: any, arg: any) {
          return arg;
        };
        const result = await outcome(() =>
          scenario === "all"
            ? service.evaluateOnPlaywrightSelectorAll(
                1,
                "button",
                callback,
                options,
              )
            : scenario === "value"
              ? service.evaluateOnPlaywrightSelector(
                  1,
                  "button",
                  callback,
                  options,
                )
              : service.evaluateOnPlaywrightSelectorWithTarget(
                  "1",
                  "button",
                  callback,
                  options,
                ),
        );
        return { result, calls };
      }
      assert.deepEqual(await run(true), await run(false), scenario);
    }
  } finally {
    Date.now = clock;
    globalThis.setTimeout = timer;
  }
});
test("assembled locator evaluation runs ordinary, collection and bound iframe callbacks in Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<button id=one>One</button><button id=two>Two</button><iframe srcdoc="<button id=inside>Child</button>"></iframe>',
    );
    await page.frameLocator("iframe").locator("button").waitFor();
    const session = await page.context().newCDPSession(page),
      cdp: any = {
        addListener() {},
        async callTarget(_target: any, method: string, params: any) {
          return session.send(method as any, params);
        },
      };
    const restored: any = make(true, cdp),
      vendor: any = make(false, cdp);
    for (const selector of [
      "#one",
      "iframe >> internal:control=enter-frame >> button",
    ]) {
      const callback = function (
        element: any,
        injected: any,
        arg: any,
        scope: any,
      ) {
        return {
          id: element.id,
          text: element.textContent,
          arg,
          frames: scope.frameChain.length,
        };
      };
      for (const bound of [false, true]) {
        const invoke = (service: any) =>
          bound
            ? service.withBoundPlaywrightSelector(
                1,
                selector,
                async () => true,
                (scoped: any) =>
                  scoped.evaluateOnPlaywrightSelector(1, selector, callback, {
                    arg: 7,
                  }),
                { timeoutMs: 1000 },
              )
            : service.evaluateOnPlaywrightSelector(1, selector, callback, {
                arg: 7,
                timeoutMs: 1000,
              });
        assert.deepEqual(await invoke(restored), await invoke(vendor));
      }
    }
    const callback = function (elements: any[]) {
      return elements.map((element) => element.id);
    };
    for (const selector of ["button", ".missing"]) {
      assert.deepEqual(
        await restored.evaluateOnPlaywrightSelectorAll(1, selector, callback),
        await vendor.evaluateOnPlaywrightSelectorAll(1, selector, callback),
      );
    }
    // Mutate a bound node before evaluation: it must fail, never silently re-resolve.
    for (const service of [vendor, restored]) {
      await page.evaluate(() => {
        const button = document.createElement("button");
        button.id = "removed";
        document.body.append(button);
      });
      const result = await outcome(() =>
        service.withBoundPlaywrightSelector(
          1,
          "#removed",
          async () => true,
          async (scoped: any) => {
            await page.evaluate(() =>
              document.querySelector("#removed")!.remove(),
            );
            return await scoped.evaluateOnPlaywrightSelector(
              1,
              "#removed",
              function (element: any) {
                return element.id;
              },
            );
          },
        ),
      );
      assert.ok("error" in result);
      assert.match((result as any).error, /Element is not connected/);
    }
  } finally {
    await browser.close();
  }
});
