import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  retryLocator,
  selectorDeadline,
} from "../packages/browser/src/service/playwright/retry";
import {
  focusPageElement,
  PlaywrightFocus,
} from "../packages/browser/src/service/playwright/focus";
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
  "Qv",
  "sg",
  "EF",
  "eS",
  "_F",
  "fl",
  "WA",
]);
const injectedSource = new Function(`return (${serviceExpression("hF")})`)();
test("Playwright locator retry matches original telemetry, terminal errors and deadline boundaries", async () => {
  const now = Date.now,
    timeout = globalThis.setTimeout;
  async function run(restored: boolean, scenario: string) {
    let clock = 0,
      count = 0;
    const trace: any[] = [];
    Date.now = () => clock;
    globalThis.setTimeout = ((fn: any, ms: number) => {
      trace.push(["wait", ms]);
      clock += ms;
      queueMicrotask(fn);
      return 0;
    }) as any;
    const timing = {
      startLocatorRetry: () => {
        trace.push("start");
        return {
          finish: (status: any) => trace.push(["finish", status]),
          attemptFailed: () => trace.push("failed"),
        };
      },
    };
    const options: any = {
      startedAt: 0,
      timeoutMs: 200,
      ...(scenario === "deadline"
        ? { deadlineMs: 200 }
        : scenario === "external-deadline"
          ? { deadlineMs: 50 }
          : {}),
      ...(scenario === "no-retry" ? { retry: false } : {}),
    };
    let result, error;
    try {
      result = await (restored ? retryLocator : original.Qv)(
        "selector",
        async () => {
          count++;
          if (scenario === "success" && count === 2) return "ok";
          throw Error(
            scenario === "strict"
              ? "strict mode violation: selector"
              : scenario === "restricted"
                ? "Action is restricted for this document."
                : scenario === "replaced"
                  ? "MCP App document was replaced"
                  : "not ready",
          );
        },
        options,
        timing,
      );
    } catch (e: any) {
      error = { message: e.message, code: e.code, cause: e.cause?.message };
    }
    return { trace, result, error, count, clock };
  }
  try {
    for (const scenario of [
      "success",
      "timeout",
      "deadline",
      "external-deadline",
      "no-retry",
      "strict",
      "restricted",
      "replaced",
    ])
      assert.deepEqual(
        await run(true, scenario),
        await run(false, scenario),
        scenario,
      );
  } finally {
    Date.now = now;
    globalThis.setTimeout = timeout;
  }
  for (const options of [{}, { deadlineMs: 5 }, { deadlineMs: 100 }])
    for (const timeoutMs of [0, 10, 200]) {
      const a = selectorDeadline(options, 0, timeoutMs),
        b = original.eS(options, 0, timeoutMs);
      assert.deepEqual(a, b);
      assert.equal(a === options, b === options);
    }
});
test("Playwright focus page logic matches original with the installed helper in real Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const cases = [
      { html: "<input id=target value=abc>" },
      { html: "<input id=target disabled>" },
      {
        html: "<input id=target readonly>",
        options: { requireEditable: true },
      },
      { html: '<input id=target style="display:none">' },
      {
        html: "<textarea id=target>abc</textarea>",
        options: { selectText: true },
      },
      { html: "<div id=target contenteditable>abc</div>" },
      {
        html: "<label id=target for=input>Label</label><input id=input>",
        options: { retargetInput: true },
      },
      {
        html: "<button id=target>Button</button>",
        options: { requireEditable: true },
      },
      { html: "<input id=target>", setup: "target.remove()" },
    ];
    for (const scenario of cases) {
      async function run(fn: string) {
        const page = await browser.newPage();
        try {
          await page.setContent(scenario.html);
          await page.evaluate(original.vne);
          return await page.evaluate(
            `(async()=>{const __name=x=>x;let target=document.querySelector('#target');${scenario.setup ?? ""};let error;try{await (${fn})(target,window.__codexPlaywrightInjected,${JSON.stringify({ ...scenario.options, inputTargetToken: "token" })})}catch(e){error=e.message}return {error,active:document.activeElement.id,token:document.activeElement.__codexIabInputTargetToken,selection:document.activeElement.selectionEnd-document.activeElement.selectionStart};})()`,
          );
        } finally {
          await page.close();
        }
      }
      assert.deepEqual(
        await run(focusPageElement.toString()),
        await run(serviceExpression("_F")),
        JSON.stringify(scenario),
      );
    }
  } finally {
    await browser.close();
  }
});
test("Playwright focusNode assembles real isolation, input token and focus verification", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage();
      try {
        await page.setContent("<input value=abc>");
        const session = await page.context().newCDPSession(page),
          cdp: any = new EventEmitter();
        cdp.callTarget = async (_target: any, method: string, params: any) =>
          session.send(method as any, params);
        const timing = {
          startLocatorRetry: () => ({
            finish: () => {},
            attemptFailed: () => {},
          }),
        };
        const service: any = restored
          ? new PlaywrightFocus(cdp, injectedSource, timing, true)
          : new original.ig(cdp, {}, {}, timing, true);
        const { frameTree } = await session.send("Page.getFrameTree"),
          { result } = await session.send("Runtime.evaluate", {
            expression: 'document.querySelector("input")',
          }),
          { node } = await session.send("DOM.describeNode", {
            objectId: result.objectId!,
          });
        await session.send("Runtime.releaseObject", {
          objectId: result.objectId!,
        });
        const response = await service.focusNode(
          {
            target: { tabId: 1 },
            frameId: frameTree.frame.id,
            backendNodeId: node.backendNodeId,
          },
          { timeoutMs: 1000, requireEditable: true },
        );
        const observed = await session.send("Runtime.evaluate", {
          contextId: response.executionContextId,
          expression:
            "({focused:document.activeElement.tagName,token:document.activeElement.__codexIabInputTargetToken})",
          returnByValue: true,
        });
        return {
          result: response.result,
          focused: observed.result.value.focused,
          tokenMatches:
            observed.result.value.token === response.inputTargetToken,
          hasToken: typeof response.inputTargetToken === "string",
          blockClosedShadowInput: response.blockClosedShadowInput,
        };
      } finally {
        await page.close();
      }
    }
    const actual = await run(true);
    assert.deepEqual(actual, await run(false));
    assert.equal(actual.focused, "INPUT");
    assert.equal(actual.tokenMatches, true);
    assert.equal(actual.hasToken, true);
  } finally {
    await browser.close();
  }
});
