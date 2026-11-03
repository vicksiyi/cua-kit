import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { PlaywrightService } from "../packages/browser/src/service/playwright/service";
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
  "yF",
  "bF",
  "Ds",
  "$y",
  "vp",
  "At",
]);

const source = new Function(`return (${serviceExpression("hF")})`)();
const span = {
    currentPlaywrightOperation(fallback: string) {
      return fallback;
    },
  },
  timing = {
    startLocatorRetry() {
      return { finish() {}, attemptFailed() {} };
    },
  };
function make(restored: boolean, cdp: any) {
  return restored
    ? new PlaywrightService(cdp, source, timing, span, {
        async clickPoint() {
          throw Error("not requested");
        },
      })
    : new original.ig(cdp, {}, span, timing);
}
test("assembled Playwright service exposes every original instance and static method", () => {
  const originalMethods = Object.getOwnPropertyNames(
    original.ig.prototype,
  ).filter((name) => name !== "constructor");
  for (const method of originalMethods)
    assert.equal(
      typeof (PlaywrightService.prototype as any)[method],
      "function",
      method,
    );
  for (const name of Object.getOwnPropertyNames(original.ig).filter(
    (name) => !["name", "length", "prototype"].includes(name),
  ))
    assert.equal(
      typeof (PlaywrightService as any)[name],
      typeof original.ig[name],
      name,
    );
  assert.equal(
    PlaywrightService.selectorScopeFunctions(),
    original.ig.selectorScopeFunctions(),
  );
});
test("readonly selector preparation and identity preserve generated expressions and options", async () => {
  for (const scenario of ["prepare", "distinct", "empty", "single"]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        service: any = make(restored, { addListener() {}, platform: "darwin" });
      service.resolveSelectorTarget = async (...args: any[]) => {
        calls.push(["resolve", ...args]);
        return {
          target: { tabId: 1, sessionId: "child" },
          frameId: "frame",
          selector: "button",
          oopifFrameChain: [],
        };
      };
      service.evaluateWithPlaywrightInjected = async (...args: any[]) => {
        calls.push(["evaluate", ...args]);
        return true;
      };
      const result =
        scenario === "prepare"
          ? await service.prepareReadonlyLocatorAll(
              1,
              "iframe >> internal:control=enter-frame >> button",
              "elements.length",
              { timeoutMs: 9000, deadlineMs: 100 },
            )
          : await service.selectorsResolveToDistinctElements(
              1,
              scenario === "empty"
                ? []
                : scenario === "single"
                  ? ["button"]
                  : ["#one", "#two"],
              { timeoutMs: 50 },
            );
      return { result, calls };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("assembled readonly preparation and distinct identity execute on real Chromium selectors", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<button id=one>One</button><button id=two>Two</button><iframe srcdoc="<button id=inside>Child</button>"></iframe>',
    );
    await page.frameLocator("iframe").locator("button").waitFor();
    const session = await page.context().newCDPSession(page),
      cdp: any = {
        platform: "darwin",
        addListener() {},
        async callTarget(_target: any, method: string, params: any) {
          return session.send(method as any, params);
        },
      },
      restored: any = make(true, cdp),
      vendor: any = make(false, cdp);
    for (const selectors of [
      [],
      [".missing"],
      ["#one", "#two"],
      ["#one", "button#one"],
      ["#one", ".missing"],
    ])
      assert.equal(
        await restored.selectorsResolveToDistinctElements(1, selectors),
        await vendor.selectorsResolveToDistinctElements(1, selectors),
      );
    for (const selector of [
      "button",
      ".missing",
      "iframe >> internal:control=enter-frame >> button",
    ]) {
      async function run(service: any) {
        const prepared = await service.prepareReadonlyLocatorAll(
          1,
          selector,
          "elements.map(element=>element.id)",
        );
        return await service.evaluateWithPlaywrightInjectedInTarget(
          prepared.target,
          prepared.expression,
          {},
          prepared.frameId,
        );
      }
      assert.deepEqual(await run(restored), await run(vendor));
    }
  } finally {
    await browser.close();
  }
});
