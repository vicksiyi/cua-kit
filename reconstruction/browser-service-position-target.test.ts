import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  positionAccessibilityTarget,
  AccessibilityHitError,
} from "../packages/browser/src/service/accessibility/position_target";
import { inspectTargetGeometry } from "../packages/browser/src/service/accessibility/target_geometry";
import { callElementFunction } from "../packages/browser/src/service/accessibility/element_execution";
import { scrollElementIntoView } from "../packages/browser/src/service/accessibility/activation";
const original = originalServiceBindings(["ou", "Sre", "xre", "Ere", "V2"], {
  Wv: inspectTargetGeometry,
  Oo: callElementFunction,
  Bre: scrollElementIntoView,
});
test("AX target positioning preserves source retry, stability threshold and error behavior", async () => {
  const realNow = Date.now;
  try {
    for (const mode of [
      "initial-hit",
      "after-scroll",
      "no-layout",
      "scroll-error",
      "unpositioned",
      "covered",
      "moving",
      "settles",
      "threshold",
      "vanishes",
    ])
      for (const early of [false, true]) {
        async function run(fn: typeof positionAccessibilityTarget) {
          let time = 0;
          Date.now = () => (time += 125);
          let sample = 0;
          const trace: any[] = [];
          const context: any = {
            isIabBackend: false,
            ax: {
              frameForId: () => ({ frameId: "root", target: { tabId: 1 } }),
            },
            cdp: {
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
                if (method === "DOM.getContentQuads") {
                  sample++;
                  return {
                    quads:
                      (mode === "unpositioned" && sample === 2) ||
                      (mode === "vanishes" && sample > 2)
                        ? []
                        : [[0, 0, 100, 0, 100, 100, 0, 100]],
                  };
                }
                if (method === "DOM.scrollIntoViewIfNeeded") {
                  if (mode === "no-layout")
                    throw Error("Node does not have a layout object");
                  if (mode === "scroll-error") throw Error("other failure");
                  return {};
                }
                if (method === "DOM.resolveNode")
                  return { object: { objectId: "object" } };
                if (method === "Runtime.releaseObject") return {};
                if (
                  params.functionDeclaration.includes("scrollElementIntoView")
                )
                  return { result: { value: undefined } };
                const visible =
                  mode === "initial-hit" ||
                  (mode === "after-scroll" && sample >= 2) ||
                  (["settles", "threshold"].includes(mode) && sample >= 3);
                const x =
                  mode === "moving"
                    ? sample * 2
                    : mode === "threshold"
                      ? sample * 0.5
                      : 50;
                return {
                  result: {
                    value: {
                      point: { x, y: 50 },
                      hitsTarget: visible,
                      hitTag: "DIV",
                      fallbackPoint: null,
                      viewportSize: { width: 100, height: 100 },
                    },
                  },
                };
              },
            },
          };
          let result;
          try {
            result = {
              value: await fn(
                context,
                1,
                {
                  id: 9,
                  backendNodeId: 2,
                  target: { tabId: 1 },
                  frameId: "root",
                },
                early,
              ),
            };
          } catch (e: any) {
            result = {
              error: e.message,
              cause: e.cause?.message,
              hitError:
                e instanceof AccessibilityHitError || e instanceof original.ou,
            };
          }
          return { result, trace, sample };
        }
        assert.deepEqual(
          await run(positionAccessibilityTarget),
          await run(original.V2),
          `${mode}:${early}`,
        );
      }
  } finally {
    Date.now = realNow;
  }
});

test("AX positioning scrolls an offscreen target through the real reconstructed CDP/page chain", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 600, height: 400 },
    });
    const session = await page.context().newCDPSession(page);
    async function run(fn: typeof positionAccessibilityTarget) {
      await page.setContent(
        '<div style="height:2000px"></div><button id="target">Click</button><div style="height:2000px"></div>',
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      const { frameTree } = await session.send("Page.getFrameTree");
      const { result } = await session.send("Runtime.evaluate", {
        expression: 'document.querySelector("#target")',
      });
      const { node } = await session.send("DOM.describeNode", {
        objectId: result.objectId!,
      });
      await session.send("Runtime.releaseObject", {
        objectId: result.objectId!,
      });
      const target = {
        id: 9,
        backendNodeId: node.backendNodeId,
        target: { tabId: 1 },
        frameId: frameTree.frame.id,
      };
      const context = {
        isIabBackend: false,
        ax: {
          frameForId: () => ({
            frameId: frameTree.frame.id,
            target: { tabId: 1 },
          }),
        },
        cdp: {
          callTarget: (_target: any, method: string, params: any) =>
            session.send(method as any, params),
        },
      };
      const geometry = await fn(context, 1, target);
      return { geometry, scroll: await page.evaluate(() => scrollY) };
    }
    const actual = await run(positionAccessibilityTarget);
    assert.deepEqual(actual, await run(original.V2));
    assert.ok(actual.scroll > 0);
    assert.ok(actual.geometry.point.y >= 0 && actual.geometry.point.y < 400);
  } finally {
    await browser.close();
  }
});
