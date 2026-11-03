import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  captureAXSessions,
  captureAXDocuments,
} from "../packages/browser/src/service/accessibility/capture_documents";
const original = originalServiceBindings([
  "Kh",
  "Bo",
  "j2",
  "Uv",
  "gre",
  "bre",
  "Kre",
  "Xre",
]);
const sourceSessions = original.Kh.prototype.captureSessions,
  sourceDocuments = original.Kh.prototype.captureDocuments;
const snapshot = (frame: string, names: string[] = ["DIV"]) => ({
  strings: [frame, ...names],
  documents: [
    {
      frameId: 0,
      nodes: {
        backendNodeId: names.map((_, i) => i + 1),
        nodeName: names.map((_, i) => i + 1),
        attributes: [],
      },
      layout: {
        nodeIndex: names.map((_, i) => i),
        bounds: names.map(() => [0, 0, 300, 200]),
      },
    },
  ],
});
test("AX remote session traversal matches original target checks, errors and deadline", async () => {
  const now = Date.now;
  async function run(restored: boolean, scenario: string) {
    let clock = 0;
    Date.now = () => clock;
    const trace: any[] = [],
      warnings: string[] = [];
    const tree = { frame: { id: "root" } },
      dom: any = snapshot("root", ["IFRAME", "IFRAME"]);
    if (scenario === "embedded")
      dom.documents[0].nodes.contentDocumentIndex = {
        index: [0, 1],
        value: [1, 2],
      };
    const ctx: any = {
      enableAccessibility: async (...args: any[]) =>
        trace.push(["enable", ...args]),
      throwPendingError: () => {},
      cdp: {
        callTarget: async (
          target: any,
          method: string,
          params: any,
          options: any,
        ) => {
          trace.push([target, method, params, options]);
          if (method === "DOM.describeNode") {
            if (scenario === "deadline") clock = 1000;
            if (scenario === "describe-error") throw Error("describe failed");
            return {
              node: {
                frameId: scenario === "missing-id" ? undefined : "child",
              },
            };
          }
          if (method === "Page.getFrameTree")
            return {
              frameTree: {
                frame: {
                  id: scenario === "wrong-id" ? "wrong" : "child",
                  parentId: scenario === "wrong-parent" ? "wrong" : "root",
                },
              },
            };
          if (method === "DOMSnapshot.captureSnapshot") {
            if (scenario === "snapshot-error") throw "snapshot failed";
            return snapshot("child");
          }
        },
        targetForFrameOrAttach: async (...args: any[]) => {
          trace.push(["attach", ...args]);
          return scenario === "unavailable"
            ? undefined
            : {
                tabId: 1,
                sessionId: "session",
                ...(scenario === "target-fallback"
                  ? { targetId: "fallback" }
                  : {}),
              };
        },
        targetIdForFrame: () =>
          scenario === "target-fallback" || scenario === "frame-fallback"
            ? undefined
            : "target",
      },
    };
    let result, error;
    try {
      result = restored
        ? await captureAXSessions(ctx, { tabId: 1 } as any, tree, dom, warnings)
        : await sourceSessions.call(ctx, { tabId: 1 }, tree, dom, warnings);
    } catch (e: any) {
      error = e.message;
    }
    return { trace, warnings, result, error };
  }
  try {
    for (const scenario of [
      "normal",
      "embedded",
      "deadline",
      "describe-error",
      "missing-id",
      "wrong-id",
      "wrong-parent",
      "snapshot-error",
      "unavailable",
      "target-fallback",
      "frame-fallback",
    ])
      assert.deepEqual(
        await run(true, scenario),
        await run(false, scenario),
        scenario,
      );
  } finally {
    Date.now = now;
  }
});

test("AX document capture matches original frame ordering, parent sessions, bounds and failures", async () => {
  async function run(restored: boolean, scenario: string) {
    const trace: any[] = [],
      warnings: string[] = [],
      tree = {
        frame: { id: "root" },
        childFrames: [{ frame: { id: "child", parentId: "root" } }],
      },
      sessions: any[] = [
        {
          target: { tabId: 1 },
          targetId: "tab:1",
          actionTargetId: null,
          frameTree: tree,
          domSnapshot: snapshot("root", ["IFRAME"]),
        },
      ];
    if (scenario === "remote")
      sessions.push({
        target: { tabId: 1, sessionId: "remote" },
        targetId: "remote",
        actionTargetId: "remote",
        parentFrameId: "root",
        frameTree: { frame: { id: "child" } },
        domSnapshot: snapshot("child"),
      });
    if (scenario === "missing-parent")
      tree.childFrames[0].frame.parentId = "missing";
    const ctx: any = {
      throwPendingError: () => {
        trace.push("pending");
        if (scenario === "pending-error") throw Error("pending");
      },
      cdp: {
        callTarget: async (target: any, method: string, params: any) => {
          trace.push([target, method, params]);
          if (method === "Accessibility.getFullAXTree") {
            if (scenario === params.frameId + "-error")
              throw Error("AX failed");
            return { nodes: [{ nodeId: params.frameId, backendDOMNodeId: 1 }] };
          }
          if (scenario === "owner-error") throw Error("owner failed");
          return { backendNodeId: 1 };
        },
      },
    };
    let result, error;
    try {
      result = restored
        ? await captureAXDocuments(ctx, { tabId: 1 } as any, sessions, warnings)
        : await sourceDocuments.call(ctx, { tabId: 1 }, sessions, warnings);
    } catch (e: any) {
      error = e.message;
    }
    return { trace, warnings, result, error };
  }
  for (const scenario of [
    "normal",
    "remote",
    "root-error",
    "child-error",
    "owner-error",
    "missing-parent",
    "pending-error",
  ])
    assert.deepEqual(
      await run(true, scenario),
      await run(false, scenario),
      scenario,
    );
});

test("AX frame/document capture agrees with original on real Chromium same-origin iframe", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<button>Root</button><iframe srcdoc="<button>Child</button>"></iframe>',
    );
    await page.frameLocator("iframe").locator("button").waitFor();
    const session = await page.context().newCDPSession(page);
    await session.send("Accessibility.enable");
    const { frameTree } = await session.send("Page.getFrameTree"),
      dom = await session.send("DOMSnapshot.captureSnapshot", {
        computedStyles: [],
        includePaintOrder: false,
        includeDOMRects: false,
      });
    const ctx: any = {
      throwPendingError: () => {},
      enableAccessibility: async () => {},
      cdp: {
        callTarget: async (_target: any, method: string, params: any) =>
          session.send(method as any, params),
        targetForFrameOrAttach: async () => undefined,
        targetIdForFrame: () => undefined,
      },
    };
    const warnings: string[] = [],
      expectedWarnings: string[] = [],
      state: any = { tabId: 1 };
    const sessions = await captureAXSessions(
        ctx,
        state,
        frameTree,
        dom,
        warnings,
      ),
      expectedSessions = await sourceSessions.call(
        ctx,
        state,
        frameTree,
        dom,
        expectedWarnings,
      );
    assert.deepEqual(sessions, expectedSessions);
    const actual = await captureAXDocuments(ctx, state, sessions, warnings),
      expected = await sourceDocuments.call(
        ctx,
        state,
        expectedSessions,
        expectedWarnings,
      );
    assert.deepEqual(actual, expected);
    assert.deepEqual(warnings, expectedWarnings);
    assert.equal(actual.length, 2);
    assert(actual[1].frame.ownerBackendNodeId);
    assert(actual[1].frame.size!.width > 0);
  } finally {
    await browser.close();
  }
});
