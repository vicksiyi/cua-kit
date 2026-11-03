import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  prepareAccessibilityInput,
  activateAccessibilityTarget,
} from "../packages/browser/src/service/accessibility/prepare_action";
import { callElementFunction } from "../packages/browser/src/service/accessibility/element_execution";
import { activateElement } from "../packages/browser/src/service/accessibility/activation";
import { AccessibilityActionError } from "../packages/browser/src/service/accessibility/dialog_actions";
const original = originalServiceBindings(["At", "Do", "Hv", "Are"], {
  Oo: callElementFunction,
  Dre: activateElement,
});
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return {
      error: e.message,
      cause: e.cause?.message,
      wrapped:
        e instanceof AccessibilityActionError || e instanceof original.Do,
    };
  }
}
test("AX focus preparation preserves absent target and abort/error wrapping", async () => {
  for (const mode of [
    "normal",
    "absent",
    "abort-before",
    "abort-after",
    "target-error",
    "focus-error",
  ])
    for (const editable of [false, true]) {
      async function run(fn: typeof prepareAccessibilityInput) {
        const trace: any[] = [];
        const controller = new AbortController();
        if (mode === "abort-before") controller.abort(Error("aborted"));
        const context = {
          ax: {
            targetForElement(tab: number, id: number) {
              trace.push(["target", tab, id]);
              if (mode === "target-error") throw Error("stale");
              return { id, target: { tabId: tab }, backendNodeId: 7 };
            },
          },
          playwright: {
            async focusNode(target: any, options: any) {
              trace.push(["focus", target, options]);
              if (mode === "focus-error") throw Error("failed");
              if (mode === "abort-after") controller.abort(Error("aborted"));
              return {
                target: { tabId: 1 },
                executionContextId: 3,
                inputTargetToken: "token",
              };
            },
          },
        };
        return {
          result: await outcome(() =>
            fn(context, 1, mode === "absent" ? undefined : 5, {
              signal: controller.signal,
              requireEditable: editable,
            }),
          ),
          trace,
        };
      }
      assert.deepEqual(
        await run(prepareAccessibilityInput),
        await run(original.Hv),
        `${mode}:${editable}`,
      );
    }
});
test("AX activation starts both navigation waits before page action and preserves deferred failures", async () => {
  for (const nested of [false, true])
    for (const mode of [
      "normal",
      "load-error",
      "invoke-error",
      "target-error",
    ]) {
      async function run(fn: typeof activateAccessibilityTarget) {
        const trace: any[] = [];
        const deferred: Promise<unknown>[] = [];
        const target = {
          id: 5,
          target: { tabId: 1, ...(nested ? { sessionId: "child" } : {}) },
          backendNodeId: 7,
        };
        const context: any = {
          ax: {
            targetForElement(tab: number, id: number) {
              trace.push(["target", tab, id]);
              if (mode === "target-error") throw Error("stale");
              return target;
            },
            trackDeferredPageLoad(tab: number, p: Promise<unknown>) {
              trace.push(["track", tab]);
              deferred.push(p);
            },
          },
          cdp: {
            async waitForPageLoadEvent(...args: any[]) {
              trace.push(["wait", ...args]);
              if (mode === "load-error" || mode === "invoke-error")
                throw Error("load failed");
            },
            async callTarget(_target: any, method: string, params: any) {
              trace.push([
                method,
                {
                  ...params,
                  functionDeclaration: params.functionDeclaration
                    ? "PAGE_FUNCTION"
                    : undefined,
                },
              ]);
              if (method === "DOM.resolveNode")
                return { object: { objectId: "remote" } };
              if (method === "Runtime.releaseObject") return {};
              if (mode === "invoke-error") throw Error("invoke failed");
              return { result: { value: undefined } };
            },
          },
        };
        const result = await outcome(() => fn(context, 1, target));
        const loads = await Promise.all(deferred.map((p) => outcome(() => p)));
        return { result, trace, loads };
      }
      assert.deepEqual(
        await run(activateAccessibilityTarget),
        await run(original.Are),
        `${nested}:${mode}`,
      );
    }
});
