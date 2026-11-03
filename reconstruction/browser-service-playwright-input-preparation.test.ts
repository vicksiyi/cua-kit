import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  PlaywrightInputPreparation,
  sequentialInputToken,
} from "../packages/browser/src/service/playwright/input_preparation";
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
function make(restored: boolean, cdp: any, iab = false, documentOnly = false) {
  return restored
    ? new PlaywrightInputPreparation(cdp, injectedSource, timing, span, iab, {
        documentOnly,
      })
    : new original.ig(cdp, {}, span, timing, iab, { documentOnly });
}
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}
test("input preparation preserves page state/fill/retarget/token order and failures", async () => {
  const uuid = globalThis.crypto.randomUUID;
  globalThis.crypto.randomUUID = () => "00000000-0000-0000-0000-000000000001";
  try {
    for (const method of ["prepareLocatorFill", "prepareSequentialInput"]) {
      for (const scenario of [
        "done",
        "needsinput",
        "disabled",
        "disconnected",
        "fill-error",
        "retarget-null",
        "no-retarget",
        "focus-error",
        "already-focused",
      ]) {
        async function run(restored: boolean) {
          const service: any = make(restored, { addListener() {} }, true),
            calls: any[] = [];
          const target: any = {
            matches(selector: string) {
              calls.push(["matches", selector]);
              return scenario === "already-focused";
            },
          };
          const element: any = {
            ...target,
            scrollIntoView(options: any) {
              calls.push(["scroll", options]);
            },
          };
          const injected: any = {
            elementState(_element: any, state: string) {
              calls.push(["state", state]);
              return {
                matches: scenario !== "disabled",
                received:
                  scenario === "disconnected"
                    ? "error:notconnected"
                    : undefined,
              };
            },
            fill(_element: any, value: string) {
              calls.push(["fill", value]);
              return scenario === "done"
                ? "done"
                : scenario === "fill-error"
                  ? "unsupported"
                  : "needsinput";
            },
            retarget(_element: any, mode: string) {
              calls.push(["retarget", mode]);
              return scenario === "retarget-null" ? null : target;
            },
            focusNode(_element: any, reset: boolean) {
              calls.push(["focus", reset]);
              return scenario === "focus-error" ? "failed" : "done";
            },
          };
          if (scenario === "no-retarget") delete injected.retarget;
          service.evaluateOnPlaywrightSelectorWithTarget = async (
            tab: any,
            selector: any,
            callback: any,
            options: any,
          ) => {
            calls.push(["evaluate", tab, selector, options]);
            return {
              result: await callback(element, injected, options.arg),
              target: { tabId: 1 },
            };
          };
          const result = await outcome(() =>
            service[method](
              { tab_id: 1, selector: "input", timeout_ms: 50 },
              method === "prepareLocatorFill" ? "hello" : 5000,
            ),
          );
          return {
            result,
            calls,
            target: Object.getOwnPropertyDescriptors(target),
            element: Object.fromEntries(
              Object.entries(Object.getOwnPropertyDescriptors(element)).filter(
                ([key]) => key.startsWith("__"),
              ),
            ),
          };
        }
        const actual = await run(true),
          expected = await run(false);
        // Methods are fixture functions, so compare the resulting token descriptors only.
        delete actual.target.matches;
        delete expected.target.matches;
        assert.deepEqual(actual, expected, `${method}:${scenario}`);
      }
    }
    assert.equal(sequentialInputToken(), original.Dne());
  } finally {
    globalThis.crypto.randomUUID = uuid;
  }
});
test("assembled input preparation matches original real Chromium focus, fill, sequential markers and states", async () => {
  const browser = await chromium.launch({ headless: true });
  const uuid = globalThis.crypto.randomUUID;
  globalThis.crypto.randomUUID = () => "00000000-0000-0000-0000-000000000001";
  try {
    async function run(restored: boolean, scenario: string) {
      const page = await browser.newPage();
      try {
        await page.setContent(
          '<input id=text value=old><input id=date type=date><input id=disabled disabled><input id=hidden style="display:none"><input id=check type=checkbox checked><input id=radio type=radio checked><label for=text id=label>Text</label>',
        );
        const session = await page.context().newCDPSession(page),
          cdp: any = {
            addListener() {},
            async callTarget(_target: any, method: string, params: any) {
              return session.send(method as any, params);
            },
          };
        const service: any = make(restored, cdp, true),
          request = {
            tab_id: 1,
            selector:
              scenario === "date"
                ? "#date"
                : scenario === "disabled"
                  ? "#disabled"
                  : scenario === "hidden"
                    ? "#hidden"
                    : scenario === "label"
                      ? "#label"
                      : "#text",
            timeout_ms: 0,
          };
        let result;
        if (scenario === "focus" || scenario === "label")
          result = await outcome(() =>
            service.focusLocator(request, {
              requireEditable: true,
              selectText: true,
            }),
          );
        else if (scenario === "sequential")
          result = await outcome(() => service.prepareSequentialInput(request));
        else if (scenario === "states")
          result = await outcome(async () => ({
            count: await service.countLocator({ tab_id: 1, selector: "input" }),
            checked: await service.readCheckedState({
              tab_id: 1,
              selector: "#check",
            }),
            radio: await service.readCheckedState({
              tab_id: 1,
              selector: "#radio",
            }),
            missing: await service.readElementState(
              { tab_id: 1, selector: ".missing" },
              "visible",
            ),
            disabled: await service.readElementState(
              { tab_id: 1, selector: "#disabled" },
              "enabled",
            ),
          }));
        else
          result = await outcome(() =>
            service.prepareLocatorFill(
              request,
              scenario === "date" ? "2026-11-04" : "hello",
            ),
          );
        const state = await page.evaluate(() => ({
          active: document.activeElement?.id,
          inputs: [...document.querySelectorAll("input")].map((el) => ({
            id: el.id,
            value: el.value,
            input: Object.getOwnPropertyDescriptor(
              el,
              "__codexIabInputTargetToken",
            ),
            sequential: Object.getOwnPropertyDescriptor(
              el,
              "__codexPressSequentiallyTargetToken",
            ),
          })),
        }));
        return { result, state };
      } finally {
        await page.close();
      }
    }
    for (const scenario of [
      "fill",
      "date",
      "disabled",
      "hidden",
      "focus",
      "label",
      "sequential",
      "states",
    ]) {
      assert.deepEqual(
        await run(true, scenario),
        await run(false, scenario),
        scenario,
      );
    }
  } finally {
    globalThis.crypto.randomUUID = uuid;
    await browser.close();
  }
});
