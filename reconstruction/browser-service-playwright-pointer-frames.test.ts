import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  PlaywrightPointerFrames,
  pointInFrameQuad,
} from "../packages/browser/src/service/playwright/pointer_frames";
const original = originalServiceBindings(["ig", "li", "b5", "gp", "xF", "Mo"]);
const span = {
  currentPlaywrightOperation(fallback: string) {
    return fallback;
  },
};
function make(restored: boolean, cdp: any, iab = false) {
  return restored
    ? new PlaywrightPointerFrames(cdp, "", {} as any, span, iab)
    : new original.ig(cdp, {}, span, {}, iab);
}
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("pointer frame mapping preserves transforms, reversed chain and failure behavior", async () => {
  for (const quad of [
    undefined,
    [],
    [0, 0, 1, 0, 1, 1, 0, 1],
    [10, 20, 110, 30, 120, 130, 20, 120],
  ])
    for (const size of [
      undefined,
      { width: 50, height: 50 },
      { width: 0, height: 0 },
    ])
      assert.deepEqual(
        pointInFrameQuad({ x: 12, y: 7 }, size, quad),
        original.li({ x: 12, y: 7 }, size, quad),
      );
  for (const scenario of [
    "normal",
    "iab",
    "empty",
    "missing-id",
    "missing-quad",
    "owner-error",
  ]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        service: any = make(restored, { addListener() {} }, scenario === "iab");
      service.callCdpTarget = async (...args: any[]) => {
        calls.push(args);
        if (scenario === "owner-error") throw Error("owner missing");
        return args[1] === "DOM.getFrameOwner"
          ? { backendNodeId: 9 }
          : args[1] === "DOM.getBoxModel"
            ? { model: { content: [10, 20, 110, 20, 110, 120, 10, 120] } }
            : {
                quads:
                  scenario === "missing-quad"
                    ? []
                    : [[10, 20, 110, 20, 110, 120, 10, 120]],
              };
      };
      const chain =
        scenario === "empty"
          ? []
          : [
              {
                frameId: scenario === "missing-id" ? null : "outer",
                parentTarget: { tabId: 1 },
                size: { width: 50, height: 50 },
              },
              {
                frameId: "inner",
                parentTarget: { tabId: 1, sessionId: "child" },
                size: { width: 50, height: 50 },
              },
            ];
      const result = await outcome(() =>
        service.currentTopLevelPointForAction({ x: 2, y: 3 }, chain, {
          timeoutMs: 15,
        }),
      );
      return { result, calls, chain };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("pointer frame obstruction preserves owner/frame acceptance, descriptions and swallowed failures", async () => {
  for (const scenario of [
    "owner",
    "frame",
    "blocked",
    "hit-error",
    "describe-error",
    "attributes",
    "unknown",
  ]) {
    async function run(restored: boolean) {
      const calls: any[] = [],
        service: any = make(restored, { addListener() {} });
      service.callCdpTarget = async (...args: any[]) => {
        calls.push(args);
        if (args[1] === "DOM.getNodeForLocation") {
          if (scenario === "hit-error") throw Error("hit failed");
          return {
            backendNodeId: scenario === "owner" ? 9 : 10,
            frameId: scenario === "frame" ? "child" : "other",
          };
        }
        if (scenario === "describe-error") throw Error("describe failed");
        return {
          node:
            scenario === "unknown"
              ? {}
              : {
                  nodeName: "DIV",
                  attributes:
                    scenario === "attributes"
                      ? ["id", "first", "id", "second", "class", " a b c d "]
                      : ["id", "overlay"],
                },
        };
      };
      const boundary = {
        frame: {
          frameId: "child",
          parentTarget: { tabId: 1 },
          size: { width: 50, height: 50 },
        },
        ownerBackendNodeId: 9,
        point: { x: 2.6, y: 3.2 },
      };
      return {
        result: await service.obstructingFrameHitTarget(
          { frameBoundaries: [boundary] },
          { timeoutMs: 50 },
        ),
        calls,
      };
    }
    assert.deepEqual(await run(true), await run(false), scenario);
  }
});
test("pointer frame mapping and obstruction detection match original against Chromium DOM", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<style>body{margin:0}iframe{position:absolute;left:40px;top:60px;width:200px;height:100px;border:0}</style><iframe srcdoc="<button>Child</button>"></iframe>',
    );
    await page.frameLocator("iframe").locator("button").waitFor();
    const session = await page.context().newCDPSession(page),
      cdp: any = {
        addListener() {},
        async callTarget(_target: any, method: string, params: any) {
          return session.send(method as any, params);
        },
      };
    const tree = await session.send("Page.getFrameTree"),
      frameId = tree.frameTree.childFrames![0].frame.id;
    for (const iab of [false, true]) {
      const frame = {
          frameId,
          parentTarget: { tabId: 1 },
          size: { width: 200, height: 100 },
        },
        restored: any = make(true, cdp, iab),
        vendor: any = make(false, cdp, iab);
      const mapped = await restored.currentTopLevelPointForAction(
        { x: 20, y: 20 },
        [frame],
      );
      assert.deepEqual(
        mapped,
        await vendor.currentTopLevelPointForAction({ x: 20, y: 20 }, [frame]),
      );
      assert.deepEqual(mapped.point, { x: 60, y: 80 });
      assert.equal(await restored.obstructingFrameHitTarget(mapped), null);
      await page.evaluate(() => {
        const overlay = document.createElement("div");
        overlay.id = "overlay";
        overlay.style.cssText =
          "position:absolute;left:0;top:0;width:400px;height:300px;z-index:10";
        document.body.append(overlay);
      });
      assert.equal(
        await restored.obstructingFrameHitTarget(mapped),
        await vendor.obstructingFrameHitTarget(mapped),
      );
      assert.equal(
        await restored.obstructingFrameHitTarget(mapped),
        "<div#overlay>",
      );
      await page.evaluate(() => document.querySelector("#overlay")!.remove());
    }
  } finally {
    await browser.close();
  }
});
