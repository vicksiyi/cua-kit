import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  accessibilityPoint,
  coordinateTarget,
  scrollAccessibilityTarget,
} from "../packages/browser/src/service/accessibility/scroll_action";
import { positionAccessibilityTarget } from "../packages/browser/src/service/accessibility/position_target";
const original = originalServiceBindings(["ar", "kre", "Vh", "Pre"], {
  V2: positionAccessibilityTarget,
});
async function outcome(fn: () => unknown) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("AX coordinate validation preserves finite fractional points and viewport bounds", async () => {
  for (const value of [
    undefined,
    1,
    {},
    [],
    [1],
    [1, "2"],
    [NaN, 2],
    [Infinity, 1],
    [-1, 0],
    [0, 0],
    [99.9, 49.9],
    [100, 0],
    [0, 50],
    [1, 2, 3],
  ]) {
    assert.deepEqual(
      await outcome(() => accessibilityPoint(value)),
      await outcome(() => original.kre(value)),
    );
    async function run(fn: typeof coordinateTarget) {
      const trace: any[] = [];
      const context = {
        cdp: {
          async call(...args: any[]) {
            trace.push(args);
            return {
              cssVisualViewport: { clientWidth: 100, clientHeight: 50 },
            };
          },
        },
      };
      return { result: await outcome(() => fn(context, 1, value)), trace };
    }
    assert.deepEqual(await run(coordinateTarget), await run(original.Vh));
  }
});
test("AX scroll matches original direction aliases, page floor, node and coordinate routes", async () => {
  for (const target of [7, [10, 20]])
    for (const direction of ["left", "l", "right", "r", "up", "u", "down", "d"])
      for (const pages of [undefined, 0, 0.5, 2]) {
        async function run(fn: typeof scrollAccessibilityTarget) {
          const trace: any[] = [];
          const context: any = {
            isIabBackend: false,
            ax: {
              targetForElement(tab: number, id: number) {
                trace.push(["target", tab, id]);
                return {
                  id,
                  backendNodeId: 2,
                  target: { tabId: 1 },
                  frameId: "root",
                };
              },
              frameForId: () => ({ frameId: "root", target: { tabId: 1 } }),
            },
            cua: {
              async dispatchMouseMove(...args: any[]) {
                trace.push(["move", ...args]);
              },
            },
            cdp: {
              async call(...args: any[]) {
                trace.push(["call", ...args]);
                return {
                  cssVisualViewport: { clientWidth: 200, clientHeight: 80 },
                };
              },
              async callTarget(_target: any, method: string, params: any) {
                trace.push([
                  "target-call",
                  method,
                  {
                    ...params,
                    functionDeclaration: params.functionDeclaration
                      ? "PAGE_FUNCTION"
                      : undefined,
                  },
                ]);
                if (method === "DOM.getContentQuads")
                  return { quads: [[0, 0, 30, 0, 30, 40, 0, 40]] };
                if (method === "DOM.resolveNode")
                  return { object: { objectId: "node" } };
                if (method === "Runtime.releaseObject") return {};
                return {
                  result: {
                    value: {
                      point: { x: 15, y: 20 },
                      hitsTarget: true,
                      hitTag: "BUTTON",
                      fallbackPoint: null,
                      viewportSize: { width: 200, height: 80 },
                    },
                  },
                };
              },
            },
          };
          return {
            result: await outcome(() =>
              fn(context, 1, { target, direction, pages }),
            ),
            trace,
          };
        }
        assert.deepEqual(
          await run(scrollAccessibilityTarget),
          await run(original.Pre),
          JSON.stringify({ target, direction, pages }),
        );
      }
});
