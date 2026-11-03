import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { PlaywrightInjection } from "../packages/browser/src/service/playwright/injection";
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
]);
const injectedSource = new Function(`return (${serviceExpression("hF")})`)();
test("Playwright injection recovery matches original for returned and thrown errors and retry limits", async () => {
  const now = Date.now;
  Date.now = () => 1000;
  async function run(restored: boolean, scenario: string, frameId?: string) {
    const cdp: any = new EventEmitter(),
      trace: any[] = [];
    let calls = 0,
      worlds = 0;
    cdp.callTarget = async (
      target: any,
      method: string,
      params: any,
      options: any,
    ) => {
      const install =
        method === "Runtime.evaluate" &&
        params.expression.includes("isProtectedCredentialField =");
      trace.push([
        target,
        method,
        install ? { ...params, expression: "<installation>" } : params,
        options,
      ]);
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: ++worlds };
      if (method === "Runtime.releaseObject") return {};
      if (install) {
        if (scenario === "install-error")
          return { exceptionDetails: { text: "install failed" } };
        return { result: { value: undefined } };
      }
      calls++;
      if (calls === 1 || scenario === "repeat-missing") {
        const message = scenario.includes("missing")
          ? "Browser Use Playwright injected helper is missing"
          : scenario.includes("destroyed")
            ? "Execution context was destroyed"
            : "ordinary failure";
        if (scenario.startsWith("throw-")) throw Error(message);
        if (scenario !== "normal" && scenario !== "install-error")
          return {
            result: { objectId: "result" },
            exceptionDetails: {
              exception: { objectId: "exception", description: message },
            },
          };
      }
      return { result: { value: "ok" } };
    };
    const service: any = restored
      ? new PlaywrightInjection(cdp, injectedSource)
      : new original.ig(cdp, {}, {}, {});
    let result, error;
    try {
      result = await service.evaluateWithPlaywrightInjectedInTarget(
        { tabId: 1 },
        "1",
        {
          deadlineMs: 1100,
          timeoutMs: 500,
          telemetryAttrs: { "browser_use.playwright.operation": 17 },
        },
        frameId,
      );
    } catch (e: any) {
      error = { message: e.message, code: e.code };
    }
    return {
      trace,
      result,
      error,
      calls,
      worlds,
      cache: [...service.playwrightInjectedTargets],
    };
  }
  try {
    for (const scenario of [
      "normal",
      "return-missing",
      "throw-missing",
      "return-destroyed",
      "throw-destroyed",
      "return-ordinary",
      "throw-ordinary",
      "repeat-missing",
      "install-error",
    ])
      for (const frame of [undefined, "frame"])
        assert.deepEqual(
          await run(true, scenario, frame),
          await run(false, scenario, frame),
          `${scenario}:${frame}`,
        );
  } finally {
    Date.now = now;
  }
});
test("Playwright full installed helper installs, evaluates selectors, protects fields and recovers when removed", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage();
      await page.setContent(
        "<button>Action</button><input type=password><input id=plain>",
      );
      const session = await page.context().newCDPSession(page),
        cdp: any = new EventEmitter();
      cdp.callTarget = async (_target: any, method: string, params: any) =>
        session.send(method as any, params);
      const service: any = restored
        ? new PlaywrightInjection(cdp, injectedSource)
        : new original.ig(cdp, {}, {}, {});
      const expression = `(()=>{const helper=window.__codexPlaywrightInjected;return {count:helper.querySelectorAll(helper.parseSelector('button'),document).length,password:helper.isProtectedCredentialField(document.querySelector('input[type=password]')),plain:helper.isProtectedCredentialField(document.querySelector('#plain'))};})()`;
      const first = await service.evaluateWithPlaywrightInjectedInTarget(
        { tabId: 1 },
        expression,
      );
      await page.evaluate(() => {
        delete (window as any).__codexPlaywrightInjected;
      });
      const second = await service.evaluateWithPlaywrightInjectedInTarget(
        { tabId: 1 },
        expression,
      );
      await page.close();
      return { first, second };
    }
    const actual = await run(true);
    assert.deepEqual(actual, await run(false));
    assert.deepEqual(actual.first, { count: 1, password: true, plain: false });
    assert.deepEqual(actual.second, actual.first);
  } finally {
    await browser.close();
  }
});
