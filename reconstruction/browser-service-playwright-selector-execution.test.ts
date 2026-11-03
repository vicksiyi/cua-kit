import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  PlaywrightSelectorExecution,
  assertDocumentSelector,
  serializeArgument,
} from "../packages/browser/src/service/playwright/selector_execution";
import { frameSelectorSeparator } from "../packages/browser/src/service/playwright/frame_routing";
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
]);
const injectedSource = new Function(`return (${serviceExpression("hF")})`)();
const span = {
  currentPlaywrightOperation(fallback: string) {
    return fallback;
  },
};
function make(restored: boolean, cdp: any, policy = {}) {
  return restored
    ? new PlaywrightSelectorExecution(
        cdp,
        injectedSource,
        {} as any,
        span,
        false,
        policy,
      )
    : new original.ig(cdp, {}, span, {}, false, policy);
}
async function outcome(action: () => Promise<any>) {
  try {
    return { value: await action() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

test("selector orchestration preserves iterative target transitions and document restrictions", async () => {
  for (const scenario of [
    "root",
    "nested",
    "document",
    "document-frame",
    "expired",
    "route-error",
  ]) {
    async function run(restored: boolean) {
      const service: any = make(
        restored,
        { addListener() {} },
        { documentOnly: scenario.startsWith("document") },
      );
      const calls: any[] = [];
      let count = 0;
      service.evaluateOnPlaywrightPage = async (
        tabId: any,
        callback: any,
        options: any,
      ) => {
        calls.push(["page", tabId, options]);
        const parsed =
          scenario === "document-frame"
            ? {
                parts: [
                  {
                    body: {
                      nested: [
                        { name: "internal:control", body: "enter-frame" },
                      ],
                    },
                  },
                ],
              }
            : { parts: [{ name: "css", body: "button" }] };
        callback(
          {
            parseSelector() {
              return parsed;
            },
          },
          options.arg,
        );
      };
      service.frameRouteForFirstOopif = async (...args: any[]) => {
        calls.push(["route", ...args]);
        if (scenario === "route-error") throw Error("disconnected");
        if (scenario === "nested" && count++ < 2)
          return {
            target: { tabId: 1, sessionId: `child${count}` },
            frameId: `f${count}`,
            oopifFrameChain: [
              {
                frameId: `f${count}`,
                parentTarget: args[0].target,
                size: { width: 10, height: 20 },
              },
            ],
            selector:
              count === 1 ? `iframe${frameSelectorSeparator}button` : "button",
          };
        return null;
      };
      const result = await outcome(() =>
        service.resolveSelectorTarget(
          { target: { tabId: 1 }, oopifFrameChain: [] },
          `iframe${frameSelectorSeparator}iframe${frameSelectorSeparator}button`,
          scenario === "expired" ? { deadlineMs: 0 } : { timeoutMs: 100 },
        ),
      );
      return { result, calls };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
  assert.equal(serializeArgument(undefined), original.tS(undefined));
  assert.throws(
    () =>
      assertDocumentSelector(
        {
          parseSelector: () => ({
            nested: { name: "internal:control", body: "enter-frame" },
          }),
        },
        "x",
      ),
    /restricted/,
  );
});

test("selector execution matches original page source and node cleanup on failure", async () => {
  for (const scenario of [
    "node",
    "missing",
    "exception",
    "describe-error",
    "nested",
    "single",
    "all",
    "page",
    "page-isolated",
    "frame-missing",
  ]) {
    async function run(restored: boolean) {
      const service: any = make(restored, { addListener() {} }),
        calls: any[] = [];
      service.callRuntimeEvaluateWithPlaywrightInjectedInTarget = async (
        ...args: any[]
      ) => {
        calls.push(["evaluate", ...args]);
        return scenario === "exception"
          ? {
              result: { objectId: "node" },
              exceptionDetails: {
                text: "bad",
                exception: { objectId: "exception" },
              },
            }
          : scenario === "missing"
            ? {}
            : {
                result: { objectId: "node", value: "value" },
                executionContextId: 17,
              };
      };
      service.evaluateWithPlaywrightInjectedInTarget = async (
        ...args: any[]
      ) => {
        calls.push(["value", ...args]);
        return "value";
      };
      service.callCdpTarget = async (...args: any[]) => {
        calls.push(["cdp", ...args]);
        if (scenario === "describe-error") throw Error("describe failed");
        return {
          node: { backendNodeId: 42 },
          frameTree: {
            frame: scenario === "frame-missing" ? {} : { id: "main" },
          },
        };
      };
      service.frameIdForElementObject = async (...args: any[]) => {
        calls.push(["owner", ...args]);
        return "child";
      };
      service.releaseRuntimeObjects = async (...args: any[]) => {
        calls.push(["release", ...args]);
      };
      service.resolveSelectorTarget = async (scope: any, selector: string) => ({
        ...scope,
        selector,
      });
      const scope = {
        target: { tabId: 1 },
        oopifFrameChain: [],
        selector:
          scenario === "nested"
            ? `iframe${frameSelectorSeparator}button`
            : "button",
      };
      const options = { timeoutMs: 100 };
      const result = await outcome(() =>
        scenario === "single"
          ? service.evaluateSingleSelectorInResolvedTarget(
              scope,
              "(element) => element.id",
              undefined,
              options,
            )
          : scenario === "all"
            ? service.evaluateSelectorAllInTarget(
                scope,
                "button",
                "(elements) => elements.length",
                null,
                options,
              )
            : scenario.startsWith("page") || scenario === "frame-missing"
              ? service.evaluateOnPlaywrightPage(
                  1,
                  function (injected: any, arg: any) {
                    return arg;
                  },
                  { ...options, arg: 3, isolatedWorld: scenario !== "page" },
                )
              : service.nodeForResolvedSelectorTarget(scope, options),
      );
      return { result, calls };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});

test("assembled selector execution resolves real DOM nodes, same-origin frames and isolated page evaluations", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(
      'data:text/html,<button id="one">One</button><button id="hidden" style="display:none">Hidden</button><iframe id="child" srcdoc="<button id=inside>Child</button>"></iframe>',
    );
    await page.frameLocator("#child").locator("button").waitFor();
    const session = await page.context().newCDPSession(page);
    const cdp: any = {
      addListener() {},
      async callTarget(_target: any, method: string, params: any) {
        return session.send(method as any, params);
      },
    };
    const restored: any = make(true, cdp),
      vendor: any = make(false, cdp);
    const scope = { target: { tabId: 1 }, oopifFrameChain: [] };
    for (const selector of [
      "#one",
      "#absent",
      `#child${frameSelectorSeparator}button`,
    ]) {
      for (const method of ["single", "all", "node", "identity"]) {
        const invoke = (service: any) =>
          method === "single"
            ? service.evaluateSingleSelectorWithTarget(
                scope,
                selector,
                "(element, injected, arg) => ({id:element.id,text:element.textContent,arg})",
                { hello: true },
                { includeFrameIdentity: true },
              )
            : method === "all"
              ? service.evaluateSelectorAllInTarget(
                  scope,
                  selector,
                  "elements => elements.map(element => element.id)",
                  undefined,
                )
              : method === "node"
                ? service.nodeForResolvedSelectorTarget(
                    { ...scope, selector },
                    {},
                  )
                : service.frameIdentityForResolvedSelectorTarget({
                    ...scope,
                    selector,
                  });
        assert.deepEqual(
          await outcome(() => invoke(restored)),
          await outcome(() => invoke(vendor)),
          `${method}:${selector}`,
        );
      }
    }
    for (const isolatedWorld of [false, true]) {
      const callback = function (injected: any, arg: any) {
        return {
          count: injected.querySelectorAll(
            injected.parseSelector("button"),
            document,
          ).length,
          arg,
        };
      };
      assert.deepEqual(
        await restored.evaluateOnPlaywrightPage(1, callback, {
          isolatedWorld,
          arg: 42,
        }),
        await vendor.evaluateOnPlaywrightPage(1, callback, {
          isolatedWorld,
          arg: 42,
        }),
      );
    }
    for (const selector of [
      "button",
      `#child${frameSelectorSeparator}button`,
    ]) {
      const actual = await outcome(() =>
        make(true, cdp, { documentOnly: true }).resolveSelectorTarget(
          scope,
          selector,
        ),
      );
      const expected = await outcome(() =>
        make(false, cdp, { documentOnly: true }).resolveSelectorTarget(
          scope,
          selector,
        ),
      );
      // Readable callback names/source locations intentionally differ from minified JS.
      // Keep the full error text before its stack; successful values remain exact.
      if ("error" in actual && "error" in expected) {
        assert.equal(
          actual.error.split("\n")[0],
          expected.error.split("\n")[0],
        );
        assert.match(
          actual.error,
          /Child frame traversal is restricted for this document\./,
        );
      } else assert.deepEqual(actual, expected);
    }
  } finally {
    await browser.close();
  }
});
