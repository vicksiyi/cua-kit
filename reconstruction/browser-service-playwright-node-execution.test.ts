import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  PlaywrightNodeExecution,
  playwrightEvaluationValue,
} from "../packages/browser/src/service/playwright/node_execution";
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
]);
class NodeFixture extends PlaywrightNodeExecution {
  async ensurePlaywrightInjectedInTarget() {}
}
function create(restored: boolean, cdp: any) {
  return restored ? new NodeFixture(cdp) : new original.ig(cdp, {}, {}, {});
}
test("Playwright node execution preserves original requests, errors and remote object cleanup", async () => {
  const now = Date.now;
  Date.now = () => 1000;
  async function run(restored: boolean, scenario: string) {
    const cdp: any = new EventEmitter(),
      trace: any[] = [];
    cdp.callTarget = async (
      target: any,
      method: string,
      params: any,
      options: any,
    ) => {
      trace.push([target, method, params, options]);
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: 9 };
      if (method === "DOM.resolveNode") {
        if (scenario === "resolve-error") throw Error("resolve failed");
        return {
          object: { objectId: scenario === "missing" ? undefined : "node" },
        };
      }
      if (method === "Runtime.callFunctionOn") {
        if (scenario === "call-error") throw Error("call failed");
        return scenario === "exception"
          ? {
              exceptionDetails: {
                exception: { objectId: "error", description: "failure" },
              },
            }
          : { result: { value: "result" } };
      }
      if (method === "Runtime.releaseObject" && scenario === "release-error")
        throw Error("cleanup failed");
      return {};
    };
    const state: any = create(restored, cdp);
    state.ensurePlaywrightInjectedInTarget = async (...args: any[]) => {
      trace.push(["ensure", ...args]);
    };
    const node = {
      target: { tabId: 1 },
      backendNodeId: 5,
      ...(scenario === "isolated" ? { frameId: "frame" } : {}),
    };
    let result, error;
    try {
      result = await state.evaluateOnPlaywrightNode(
        node,
        (element: any, _injected: any, arg: any) => [element.tagName, arg],
        {
          arg: scenario === "null-arg" ? null : { x: 1 },
          telemetryAttrs: { trace: true },
        },
      );
    } catch (e: any) {
      error = e.message;
    }
    await state.releaseRuntimeObjects(
      node.target,
      ["same", "same", undefined, null, "other"],
      { deadlineMs: 0, timeoutMs: 0 },
    );
    return { trace, result, error };
  }
  try {
    for (const scenario of [
      "normal",
      "isolated",
      "null-arg",
      "missing",
      "resolve-error",
      "call-error",
      "exception",
      "release-error",
    ])
      assert.deepEqual(
        await run(true, scenario),
        await run(false, scenario),
        scenario,
      );
  } finally {
    Date.now = now;
  }
  for (const response of [
    {},
    { result: { value: 0 } },
    { exceptionDetails: {} },
    {
      exceptionDetails: {
        text: "text",
        exception: { description: "description", value: "value" },
      },
    },
    { exceptionDetails: { exception: { value: 0 } } },
  ]) {
    const evaluate = (fn: any) => {
      try {
        return { value: fn(response) };
      } catch (e: any) {
        return { error: e.message };
      }
    };
    assert.deepEqual(
      evaluate(playwrightEvaluationValue),
      evaluate(original.No),
    );
  }
});
test("Playwright node execution and frame owner lookup match original in real Chromium", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage();
      await page.setContent(
        '<button>Root</button><iframe srcdoc="<input value=child>"></iframe>',
      );
      await page.frameLocator("iframe").locator("input").waitFor();
      const session = await page.context().newCDPSession(page),
        cdp: any = new EventEmitter();
      cdp.callTarget = async (_target: any, method: string, params: any) =>
        session.send(method as any, params);
      const state: any = create(restored, cdp);
      state.ensurePlaywrightInjectedInTarget = async () => {}; // Explicit injection fixture: evaluated functions below do not use the injected helper.
      const { frameTree } = await session.send("Page.getFrameTree");
      const { result: handle } = await session.send("Runtime.evaluate", {
        expression:
          'document.querySelector("iframe").contentDocument.querySelector("input")',
      });
      const { node } = await session.send("DOM.describeNode", {
        objectId: handle.objectId!,
      });
      const frame = await state.frameIdForElementObject(
        { tabId: 1 },
        handle.objectId,
        {},
      );
      await session.send("Runtime.releaseObject", {
        objectId: handle.objectId!,
      });
      const selected = {
        target: { tabId: 1 },
        backendNodeId: node.backendNodeId,
        frameId: frameTree.childFrames![0].frame.id,
      };
      const value = await state.evaluateOnPlaywrightNode(
        selected,
        (element: any, _injected: any, arg: any) => {
          element.value = arg;
          return element.value;
        },
        { arg: "updated" },
      );
      await page.close();
      return {
        result: value.result,
        hasContext: typeof value.executionContextId === "number",
        frameMatches: frame === selected.frameId,
      };
    }
    const expected = await run(false),
      actual = await run(true);
    assert.deepEqual(actual, expected);
    assert.deepEqual(actual, {
      result: "updated",
      hasContext: true,
      frameMatches: true,
    });
  } finally {
    await browser.close();
  }
});
