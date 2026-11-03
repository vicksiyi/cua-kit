import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  PlaywrightFrameRouting,
  frameSelectorSeparator,
  isLocalFrameUrl,
  remainingFrameSelector,
  flattenFrameTree,
} from "../packages/browser/src/service/playwright/frame_routing";
import { assertSelectorDeadline } from "../packages/browser/src/service/playwright/execution_state";
const original = originalServiceBindings(
  ["ig", "Rne", "Ine", "iS", "Fo", "kne", "Bne", "No", "oS", "au"],
  {
    ot: assertSelectorDeadline,
    qc: frameSelectorSeparator,
    tg: "Frame target is not available for this iframe selector path",
  },
);

test("iframe routing matches original targets, expressions, failures and remote cleanup", async () => {
  for (const scenario of [
    "remote",
    "isolated",
    "local",
    "cached",
    "missing",
    "ambiguous",
    "name",
    "metadata-error",
    "node-error",
    "both-error",
    "exception",
    "empty",
    "merge",
    "no-capability",
    "plain",
    "iab",
    "attach-null",
  ]) {
    async function run(restored: boolean) {
      const calls: any[] = [];
      const cdp: any = {
        addListener() {},
        call() {
          throw Error("unexpected");
        },
        async enableOopifAutoAttach(...args: any[]) {
          calls.push(["attach", ...args]);
        },
        targetForFrame(...args: any[]) {
          calls.push(["lookup", ...args]);
          return scenario === "cached"
            ? null
            : { tabId: 1, sessionId: "child" };
        },
        async targetForFrameOrAttach(...args: any[]) {
          calls.push(["target", ...args]);
          return scenario === "missing" || scenario === "attach-null"
            ? null
            : { tabId: 1, sessionId: "child" };
        },
      };
      if (scenario === "no-capability") delete cdp.enableOopifAutoAttach;
      const service: any = restored
        ? new PlaywrightFrameRouting(cdp, "", {} as any, scenario === "iab")
        : new original.ig(cdp, {}, {}, {}, scenario === "iab");
      service.callRuntimeEvaluateWithPlaywrightInjectedInTarget = async (
        ...args: any[]
      ) => {
        calls.push(["evaluate", ...args]);
        return scenario === "exception"
          ? {
              result: { objectId: "element" },
              exceptionDetails: {
                text: "bad selector",
                exception: { objectId: "exception" },
              },
            }
          : scenario === "empty"
            ? { result: { value: null } }
            : { result: { objectId: "element" } };
      };
      service.releaseRuntimeObjects = async (...args: any[]) => {
        calls.push(["release", ...args]);
      };
      service.callCdpTarget = async (...args: any[]) => {
        calls.push(["cdp", ...args]);
        const method = args[1];
        if (method === "Runtime.callFunctionOn") {
          if (["metadata-error", "both-error"].includes(scenario))
            throw Error("metadata failed");
          return {
            result: {
              objectId: "metadata",
              value: {
                enterFrameCount: 1,
                frameUrl:
                  scenario === "local" ? "about:blank" : "https://child.test/",
                ...(scenario === "name" ? { frameName: "chosen" } : {}),
                size: { width: 200, height: 100 },
              },
            },
          };
        }
        if (method === "DOM.describeNode") {
          if (["node-error", "both-error"].includes(scenario))
            throw Error("node failed");
          return {
            node: ["missing", "ambiguous", "name"].includes(scenario)
              ? {}
              : { frameId: "child-frame" },
          };
        }
        if (method === "Page.getFrameTree")
          return {
            frameTree: {
              frame: { id: "root", url: "https://root.test/" },
              childFrames:
                scenario === "missing"
                  ? []
                  : [
                      {
                        frame: {
                          id: "one",
                          url: "https://child.test/",
                          name: "chosen",
                        },
                      },
                      {
                        frame: {
                          id: "two",
                          url: "https://child.test/",
                          name: "other",
                        },
                      },
                    ],
            },
          };
        throw Error(method);
      };
      if (scenario === "cached")
        service.playwrightFrameWorlds.set("1:child-frame", {
          executionContextId: 42,
        });
      const scope = {
        target: { tabId: 1 },
        oopifFrameChain:
          scenario === "merge"
            ? [
                {
                  frameId: "old",
                  parentTarget: { tabId: 1 },
                  size: { width: 1, height: 1 },
                },
              ]
            : [],
      };
      let result, error;
      try {
        result = await service.frameRouteForFirstOopif(
          scope,
          scenario === "plain"
            ? "button"
            : `iframe${frameSelectorSeparator}button`,
          scenario === "isolated" ? { isolatedWorld: true } : {},
        );
      } catch (e) {
        error = (e as Error).message;
      }
      return { result, error, calls };
    }
    const actual = await run(true),
      expected = await run(false);
    assert.deepEqual(actual, expected, scenario);
    if (scenario === "remote")
      assert.deepEqual(actual.result?.target, { tabId: 1, sessionId: "child" });
    if (scenario === "local" || scenario === "cached")
      assert.equal(actual.result?.frameId, "child-frame");
    if (scenario === "both-error")
      assert.equal(actual.error, "metadata failed");
    if (scenario === "missing") assert.ok(actual.error);
  }
});
test("frame tree and selector helpers preserve original parsing and ambiguity behavior", () => {
  for (const url of [
    undefined,
    "",
    "bad",
    "about:blank",
    "data:text/html,x",
    "https://x",
    "blob:https://x/a",
  ])
    assert.equal(isLocalFrameUrl(url), original.Rne(url));
  for (const count of [0, 1, 2, 3, -1])
    assert.equal(
      remainingFrameSelector(
        `a${frameSelectorSeparator}b${frameSelectorSeparator}c`,
        count,
      ),
      original.Ine(
        `a${frameSelectorSeparator}b${frameSelectorSeparator}c`,
        count,
      ),
    );
  const tree = {
    frame: { id: "a" },
    childFrames: [
      { frame: { id: "b" }, childFrames: [{ frame: { id: "c" } }] },
    ],
  };
  assert.deepEqual(flattenFrameTree(tree), original.iS(tree));
});

test("iframe route executes page lookup and metadata against real Chromium sandbox frame", async () => {
  const { chromium } = await import("playwright");
  const { serviceExpression } = await import("./service-source");
  const injectedSource = new Function(`return (${serviceExpression("hF")})`)();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<iframe id="child" sandbox style="width:200px;height:100px;border:0" srcdoc="<button>Child</button>"></iframe>',
    );
    await page.frameLocator("#child").locator("button").waitFor();
    const session = await page.context().newCDPSession(page);
    const calls: string[] = [];
    const cdp: any = {
      addListener() {},
      async callTarget(_target: any, method: string, params: any) {
        calls.push(method);
        return session.send(method as any, params);
      },
      async enableOopifAutoAttach() {},
      targetForFrame() {
        return null;
      },
    };
    const service = new PlaywrightFrameRouting(cdp, injectedSource, {} as any);
    const result = await service.frameRouteForFirstOopif(
      { target: { tabId: 1 }, oopifFrameChain: [] },
      `#child${frameSelectorSeparator}button`,
    );
    assert.ok(result?.frameId);
    assert.equal(result.selector, "button");
    assert.deepEqual(result.target, { tabId: 1 });
    assert.deepEqual(result.oopifFrameChain[0].size, {
      width: 200,
      height: 100,
    });
    assert.ok(calls.includes("DOM.describeNode"));
    assert.ok(calls.includes("Runtime.releaseObject"));
    // This fixture exercises real page/CDP discovery with explicit same-target fallback;
    // real attached OOPIF transport remains a separate end-to-end integration requirement.
  } finally {
    await browser.close();
  }
});
