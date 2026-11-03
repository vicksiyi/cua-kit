import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  PlaywrightClick,
  syntheticDocumentClick,
} from "../packages/browser/src/service/playwright/click";
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
function make(restored: boolean, cdp: any, cua: any, policy: any = {}) {
  return restored
    ? new PlaywrightClick(cdp, source, timing, span, cua, false, policy)
    : new original.ig(cdp, cua, span, timing, false, policy);
}
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}
test("click locator preserves physical/synthetic routing, modifiers and policy rejection", async () => {
  for (const scenario of [
    "plain",
    "nested",
    "right",
    "modifiers",
    "force",
    "double",
    "synthetic",
    "synthetic-right",
    "synthetic-modifiers",
    "synthetic-force",
    "synthetic-double",
    "before-error",
  ]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        policy =
          scenario.startsWith("synthetic") || scenario === "before-error"
            ? { clickDispatch: "synthetic" }
            : {},
        service: any = make(
          restored,
          { addListener() {}, platform: "darwin" },
          {
            async clickPoint(options: any) {
              calls.push(["click", options]);
            },
          },
          policy,
        );
      service.performPointerAction = async (request: any, options: any) => {
        const { dispatch, ...rest } = options;
        calls.push(["prepare", request, rest]);
        await dispatch({
          point: { x: 10, y: 20 },
          inputPoint: { x: 1, y: 2 },
          target:
            scenario === "nested"
              ? { tabId: 1, sessionId: "child" }
              : { tabId: 1 },
          inputTarget: { tabId: 1, sessionId: "child" },
        });
      };
      service.beforeDocumentClick = async (point: any) => {
        calls.push(["before", point]);
        if (scenario === "before-error") throw Error("document replaced");
      };
      service.evaluateOnPlaywrightSelector = async (
        tab: any,
        selector: any,
        _callback: any,
        options: any,
      ) => {
        calls.push(["evaluate", tab, selector, options]);
      };
      const request: any = { tab_id: 1, selector: "button", timeout_ms: 20 };
      if (scenario.endsWith("right")) request.button = "right";
      if (scenario.endsWith("modifiers"))
        request.modifiers = ["ControlOrMeta", "Shift"];
      if (scenario.endsWith("force")) request.force = true;
      return {
        result: await outcome(() =>
          service.clickLocator(request, scenario.endsWith("double") ? 2 : 1),
        ),
        calls,
      };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("synthetic click preserves real event order, cancellation, focus and document/hit guards", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of [
      "plain",
      "prevent-pointer",
      "prevent-mouse",
      "remove",
      "overlay",
      "shadow",
    ]) {
      async function run(restored: boolean) {
        const page = await browser.newPage();
        try {
          await page.setContent(
            '<button id=target style="width:100px;height:40px">Click</button>',
          );
          await page.evaluate((scenario: string) => {
            let target: any = document.querySelector("button");
            if (scenario === "shadow") {
              const host = document.createElement("div");
              document.body.append(host);
              host.attachShadow({ mode: "open" }).append(target);
            }
            (window as any).events = [];
            for (const type of [
              "pointerdown",
              "mousedown",
              "pointerup",
              "mouseup",
              "click",
            ])
              target.addEventListener(type, (event: any) => {
                (window as any).events.push({
                  type: event.type,
                  buttons: event.buttons,
                  pointerId: event.pointerId,
                  trusted: event.isTrusted,
                });
                if (
                  (scenario === "prevent-pointer" && type === "pointerdown") ||
                  (scenario === "prevent-mouse" && type === "mousedown")
                )
                  event.preventDefault();
                if (scenario === "remove" && type === "pointerdown")
                  target.remove();
                if (scenario === "overlay" && type === "pointerdown") {
                  const overlay = document.createElement("div");
                  overlay.style.cssText = "position:fixed;inset:0;z-index:100";
                  document.body.append(overlay);
                }
              });
          }, scenario);
          await page.evaluate(original.vne);
          return await page.evaluate(
            `(()=>{const __name=(value)=>value;let target=document.querySelector('button')||document.querySelector('div').shadowRoot.querySelector('button');const rect=target.getBoundingClientRect();let error;try{(${restored ? syntheticDocumentClick.toString() : original.yF.toString()})(target,window.__codexPlaywrightInjected,{x:rect.left+rect.width/2,y:rect.top+rect.height/2});}catch(e){error=e.message;}let active=document.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return {events:window.events,error,active:active?.id};})()`,
          );
        } finally {
          await page.close();
        }
      }
      assert.deepEqual(await run(true), await run(false), scenario);
    }
  } finally {
    await browser.close();
  }
});
test("assembled synthetic clickLocator triggers an actual page handler without a physical backend", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<button onclick="window.clicked=(window.clicked||0)+1">Click</button>',
    );
    const session = await page.context().newCDPSession(page),
      cdp: any = {
        platform: "darwin",
        addListener() {},
        async callTarget(_target: any, method: string, params: any) {
          return session.send(method as any, params);
        },
      };
    for (const restored of [false, true]) {
      const service = make(
        restored,
        cdp,
        {
          async clickPoint() {
            throw Error("unexpected physical click");
          },
        },
        { documentOnly: true, clickDispatch: "synthetic" },
      );
      await service.clickLocator(
        { tab_id: 1, selector: "button", timeout_ms: 1000 },
        1,
      );
    }
    assert.equal(await page.evaluate(() => (window as any).clicked), 2);
  } finally {
    await browser.close();
  }
});
