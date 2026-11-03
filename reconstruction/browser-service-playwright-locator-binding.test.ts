import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { PlaywrightLocatorBinding } from "../packages/browser/src/service/playwright/locator_binding";
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
]);

const injectedSource = new Function(`return (${serviceExpression("hF")})`)();
const span = {
  currentPlaywrightOperation(fallback: string) {
    return fallback;
  },
};
function make(restored: boolean, cdp: any) {
  return restored
    ? new PlaywrightLocatorBinding(cdp, injectedSource, {} as any, span)
    : new original.ig(cdp, {}, span, {});
}
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (error) {
    const e = error as any;
    return { error: e.message, code: e.code, cause: e.cause?.message };
  }
}
test("locator resolution preserves retry clock, deadline boundaries and error causes", async () => {
  const clock = Date.now,
    timer = globalThis.setTimeout;
  try {
    for (const scenario of [
      "success",
      "retry",
      "zero",
      "terminal",
      "no-retry",
      "deadline",
      "timeout",
      "isolated",
      "missing-frame",
      "numeric",
    ]) {
      async function run(restored: boolean) {
        let time = 1000,
          attempts = 0;
        Date.now = () => time;
        const calls: any[] = [];
        globalThis.setTimeout = ((callback: any, delay: number) => {
          calls.push(["sleep", delay]);
          time += delay;
          callback();
          return 0;
        }) as any;
        const service: any = make(restored, { addListener() {} });
        service.callCdpTarget = async (...args: any[]) => {
          calls.push(["cdp", ...args]);
          return {
            frameTree: {
              frame: scenario === "missing-frame" ? {} : { id: "root" },
            },
          };
        };
        service.resolveSelectorTarget = async (
          scope: any,
          selector: string,
          options: any,
        ) => {
          calls.push(["resolve", scope, selector, options]);
          return { ...scope, selector };
        };
        service.nodeForResolvedSelectorTarget = async (...args: any[]) => {
          calls.push(["node", ...args]);
          attempts++;
          if (scenario === "terminal")
            throw Error("strict mode violation: multiple");
          if (scenario === "timeout") {
            time += 200;
            throw Error("not present");
          }
          if (
            ["zero", "no-retry"].includes(scenario) ||
            (scenario === "retry" && attempts === 1)
          )
            throw Error("not present");
          return { backendNodeId: 9 };
        };
        const options: any = { timeoutMs: 200 };
        if (scenario === "zero") options.timeoutMs = 0;
        if (scenario === "deadline") options.deadlineMs = 1000;
        if (scenario === "no-retry" || scenario === "missing-frame")
          options.retry = false;
        if (scenario === "isolated" || scenario === "missing-frame")
          options.isolatedWorld = true;
        const result = await outcome(() =>
          scenario === "numeric"
            ? service.resolvePlaywrightSelector("1", "button")
            : service.resolvePlaywrightSelectorNode(1, "button", options),
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
test("bound locator scopes preserve validation order, descriptor, prototype and release on failures", async () => {
  for (const scenario of [
    "success",
    "denied",
    "validate-error",
    "action-error",
  ]) {
    async function run(restored: boolean) {
      const service: any = make(restored, { addListener() {} }),
        calls: any[] = [];
      service.resolvePlaywrightSelectorNode = async (...args: any[]) => {
        calls.push(["resolve", ...args]);
        return { backendNodeId: 9, target: { tabId: 1 }, oopifFrameChain: [] };
      };
      service.withPlaywrightNode = async (
        node: any,
        callback: any,
        options: any,
      ) => {
        calls.push(["acquire", node, options]);
        try {
          return await callback("remote", 17);
        } finally {
          calls.push(["release"]);
        }
      };
      const result = await outcome(() =>
        service.withBoundPlaywrightSelector(
          1,
          "button",
          async () => {
            calls.push(["validate"]);
            if (scenario === "validate-error") throw Error("stale document");
            return scenario !== "denied";
          },
          async (scoped: any) => {
            calls.push([
              "action",
              Object.getPrototypeOf(scoped) === service,
              Object.getOwnPropertyDescriptor(scoped, "boundSelector"),
              service.boundSelector,
            ]);
            if (scenario === "action-error") throw Error("action failed");
            return "done";
          },
          { timeoutMs: 22, isolatedWorld: true },
        ),
      );
      return { result, calls };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("assembled bound locator resolves iframe node in isolated world and releases its real handle", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<iframe srcdoc="<button id=inside>Child</button>"></iframe>',
    );
    await page.frameLocator("iframe").locator("button").waitFor();
    const session = await page.context().newCDPSession(page),
      released: string[] = [];
    const cdp: any = {
      addListener() {},
      async callTarget(_target: any, method: string, params: any) {
        if (method === "Runtime.releaseObject") released.push(params.objectId);
        return session.send(method as any, params);
      },
    };
    for (const restored of [false, true]) {
      const service: any = make(restored, cdp);
      let handle: string | undefined;
      const value = await service.withBoundPlaywrightSelector(
        1,
        "iframe >> internal:control=enter-frame >> button",
        async () => true,
        async (scoped: any) => {
          handle = scoped.boundSelector.objectId;
          assert.equal(Object.getPrototypeOf(scoped), service);
          assert.equal(service.boundSelector, undefined);
          assert.ok(scoped.boundSelector.executionContextId);
          const result = await session.send("Runtime.callFunctionOn", {
            objectId: handle,
            functionDeclaration:
              "function(){return {id:this.id,text:this.textContent}}",
            returnByValue: true,
          });
          return result.result.value;
        },
        { timeoutMs: 1000, isolatedWorld: true },
      );
      assert.deepEqual(value, { id: "inside", text: "Child" });
      assert.ok(released.includes(handle!));
      const after = await outcome(() =>
        session.send("Runtime.callFunctionOn", {
          objectId: handle,
          functionDeclaration: "function(){return this.id}",
        }),
      );
      assert.ok("error" in after);
    }
  } finally {
    await browser.close();
  }
});
