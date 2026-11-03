import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  callElementFunction,
  createSetAccessibilityValue,
} from "../packages/browser/src/service/accessibility/element_execution";
import { setElementValue } from "../packages/browser/src/service/accessibility/set_value";
const original = originalServiceBindings(["Oo"]);
const target = {
  id: 3,
  target: { tabId: 1, sessionId: "frame" },
  backendNodeId: 42,
};
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}

test("AX remote execution preserves payloads, exception precedence and release behavior", async () => {
  for (const mode of [
    "normal",
    "no-object",
    "resolve-error",
    "invoke-error",
    "release-error",
    "description",
    "value",
    "text",
    "fallback",
  ]) {
    async function run(fn: typeof callElementFunction) {
      const calls: unknown[] = [];
      const context = {
        cdp: {
          async callTarget(...args: any[]) {
            calls.push(args);
            const method = args[1];
            if (method === "DOM.resolveNode") {
              if (mode === "resolve-error") throw Error("resolve failed");
              return {
                object: mode === "no-object" ? {} : { objectId: "object" },
              };
            }
            if (method === "Runtime.releaseObject") {
              if (mode === "release-error") throw Error("release failed");
              return {};
            }
            if (mode === "invoke-error") throw Error("invoke failed");
            if (["description", "value", "text", "fallback"].includes(mode))
              return {
                exceptionDetails: {
                  exception: {
                    description:
                      mode === "description" ? "description" : undefined,
                    value: mode === "value" ? false : undefined,
                  },
                  text: mode === "text" ? "text" : undefined,
                },
              };
            return { result: { value: 7 } };
          },
        },
      };
      const result = await outcome(() =>
        fn(
          context,
          target,
          function (value: number) {
            return value + 1;
          },
          6,
        ),
      );
      return { calls, result };
    }
    assert.deepEqual(
      await run(callElementFunction),
      await run(original.Oo),
      mode,
    );
  }
});

test("AX set-value dispatcher matches source over reconstructed execution, including click fallback", async () => {
  for (const mode of [
    "normal",
    "readonly",
    "tab",
    "tab-fails",
    "click-fails",
  ]) {
    async function run(source: boolean) {
      const calls: unknown[] = [];
      let invocation = 0;
      const click = async (...args: any[]) => {
        calls.push(["click", ...args.slice(1)]);
        if (mode === "click-fails") throw Error("click failed");
      };
      const context = {
        ax: {
          targetForElement(tab: number, id: number) {
            calls.push(["target", tab, id]);
            return {
              ...target,
              isValueSettable: mode === "readonly" ? false : undefined,
            };
          },
        },
        cdp: {
          async callTarget(_target: any, method: string, params: any) {
            calls.push([
              method,
              {
                ...params,
                functionDeclaration: params.functionDeclaration
                  ? "PAGE_FUNCTION"
                  : undefined,
              },
            ]);
            if (method === "DOM.resolveNode")
              return { object: { objectId: "object" } };
            if (method === "Runtime.releaseObject") return {};
            invocation++;
            return {
              result: {
                value:
                  mode === "normal"
                    ? "done"
                    : invocation === 1 || mode === "tab-fails"
                      ? "needs-click"
                      : "done",
              },
            };
          },
        },
      };
      const fn = source
        ? originalServiceBindings(["Ire"], {
            Oo: callElementFunction,
            G2: setElementValue,
            $v: click,
          }).Ire
        : createSetAccessibilityValue(click);
      return { result: await outcome(() => fn(context, 1, 3, "true")), calls };
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});

test("reconstructed AX remote executor invokes restored setters and selection in real Chromium CDP", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<input id="value" value="old">');
    const session = await page.context().newCDPSession(page);
    const result = await session.send("Runtime.evaluate", {
      expression: 'document.querySelector("#value")',
    });
    const { node } = await session.send("DOM.describeNode", {
      objectId: result.result.objectId!,
    });
    await session.send("Runtime.releaseObject", {
      objectId: result.result.objectId!,
    });
    const context = {
      cdp: {
        callTarget: async (_target: any, method: string, params: any) =>
          session.send(method as any, params),
      },
    };
    const element = {
      id: 3,
      target: { tabId: 1 },
      backendNodeId: node.backendNodeId,
    };
    const setter = createSetAccessibilityValue(async () => {
      throw Error("unexpected click");
    });
    await setter(
      { ...context, ax: { targetForElement: () => element } },
      1,
      3,
      "hello 😀",
    );
    assert.equal(await page.locator("#value").inputValue(), "hello 😀");
    const { selectElementText } =
      await import("../packages/browser/src/service/accessibility/selection");
    await callElementFunction(context, element, selectElementText, {
      text: "😀",
      selectionType: "text",
    });
    assert.deepEqual(
      await page
        .locator("#value")
        .evaluate((el: HTMLInputElement) => [
          el.selectionStart,
          el.selectionEnd,
        ]),
      [6, 8],
    );
  } finally {
    await browser.close();
  }
});
