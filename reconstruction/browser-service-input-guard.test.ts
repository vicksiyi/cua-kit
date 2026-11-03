import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source";
import {
  assertFocusedInput,
  assertInputPoint,
  iframeInputPoint,
  focusedElement,
  elementRoot,
  hostRoot,
} from "../packages/browser/src/service/input/input_guard";
const source = originalServiceBindings([
  "ml",
  "Vy",
  "jA",
  "HA",
  "Gy",
  "ru",
  "Oc",
  "Nv",
  "pre",
  "mre",
  "fre",
  "U2",
  "At",
]);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}
function normalized(params: any) {
  if (params == null) return params;
  const copy = { ...params };
  if (copy.expression?.includes("activeElement"))
    copy.expression = "<focus expression>";
  if (copy.functionDeclaration)
    copy.functionDeclaration = copy.functionDeclaration.includes(
      "activeElement",
    )
      ? "<focus>"
      : copy.functionDeclaration.includes("host")
        ? "<host root>"
        : "<element root>";
  return copy;
}
async function focus(original: boolean, mode: string) {
  const trace: any[] = [],
    cdp = {
      callTarget: async (
        target: any,
        method: string,
        params: any,
        options: any,
      ) => {
        trace.push([target, method, normalized(params), options]);
        switch (method) {
          case "Page.getFrameTree":
            return {
              frameTree: { frame: { id: target.sessionId ? "child" : "main" } },
            };
          case "Page.createIsolatedWorld":
            return { executionContextId: 1 };
          case "Runtime.evaluate":
            return {
              result:
                mode === "null"
                  ? { subtype: "null" }
                  : { objectId: target.sessionId ? "child-focus" : "focus" },
            };
          case "DOM.describeNode":
            return {
              node:
                params.objectId === "child-focus"
                  ? { localName: "input" }
                  : mode === "closed" || mode === "closed-empty"
                    ? {
                        localName: "div",
                        shadowRoots: [
                          { shadowRootType: "closed", backendNodeId: 2 },
                        ],
                      }
                    : mode === "iframe"
                      ? { localName: "iframe", frameId: "child" }
                      : mode === "same-document"
                        ? {
                            localName: "iframe",
                            contentDocument: { backendNodeId: 2 },
                          }
                        : { localName: "input" },
            };
          case "DOM.resolveNode":
            return { object: { objectId: "root" } };
          case "Runtime.callFunctionOn":
            return {
              result:
                mode === "closed-empty"
                  ? { subtype: "null" }
                  : { objectId: "child-focus" },
            };
          case "Runtime.releaseObject":
            if (mode === "release-fails") throw new Error("release");
            return {};
        }
      },
      targetForFrameOrAttach: async (...args: any[]) => {
        trace.push(["attach", args]);
        return { tabId: 1, sessionId: "child" };
      },
    };
  return {
    result: await outcome(() =>
      (original ? source.Vy : assertFocusedInput)(cdp, 1, { deadlineMs: 100 }),
    ),
    trace,
  };
}
test("focus guard matches closed-root checks, same/cross-target iframes and remote object cleanup", async () => {
  for (const mode of [
    "normal",
    "null",
    "closed",
    "closed-empty",
    "iframe",
    "same-document",
    "release-fails",
  ])
    assert.deepEqual(await focus(false, mode), await focus(true, mode));
});
async function pointer(original: boolean, mode: string, nested: boolean) {
  const trace: any[] = [],
    cdp = {
      callTarget: async (
        target: any,
        method: string,
        params: any,
        options: any,
      ) => {
        trace.push([target, method, normalized(params), options]);
        const child = target.sessionId != null;
        switch (method) {
          case "Page.getFrameTree":
            return {
              frameTree: {
                frame: child
                  ? {
                      id: "child",
                      parentId: mode === "changed" ? "wrong" : "main",
                    }
                  : { id: "main" },
              },
            };
          case "Page.getLayoutMetrics":
            return { cssVisualViewport: { pageX: 0, pageY: 0 } };
          case "Page.createIsolatedWorld":
            return { executionContextId: 1 };
          case "DOM.getNodeForLocation":
            return {
              backendNodeId: child ? 2 : 1,
              frameId: child ? "child" : "main",
            };
          case "DOM.resolveNode":
            return { object: { objectId: "element" } };
          case "Runtime.callFunctionOn":
            return {
              result: {
                objectId: params.functionDeclaration.includes("host")
                  ? "document"
                  : "root",
              },
            };
          case "DOM.describeNode":
            if (params.objectId)
              return {
                node:
                  params.objectId === "root"
                    ? {
                        shadowRootType:
                          mode === "closed"
                            ? "closed"
                            : mode === "open"
                              ? "open"
                              : undefined,
                      }
                    : {},
              };
            return {
              node:
                !child && (nested || mode === "recurse" || mode === "changed")
                  ? { localName: "iframe", frameId: "child" }
                  : { localName: "button" },
            };
          case "DOM.getBoxModel":
            return { model: { content: [0, 0, 100, 0, 100, 100, 0, 100] } };
          case "Runtime.evaluate":
            return { result: { value: { width: 100, height: 100 } } };
          case "Runtime.releaseObject":
            return {};
        }
      },
      targetForFrameOrAttach: async (...args: any[]) => {
        trace.push(["attach", args]);
        return { tabId: 1, sessionId: "child" };
      },
    };
  return {
    result: await outcome(() =>
      (original ? source.ru : assertInputPoint)(
        cdp,
        nested ? { tabId: 1, sessionId: "child" } : { tabId: 1 },
        { x: 10, y: 20 },
        { deadlineMs: 100 },
        mode === "missing" ? undefined : { x: 10, y: 20 },
      ),
    ),
    trace,
  };
}
test("pointer guard matches shadow ancestry, nested iframe path, recursive hit testing and changed-frame rejection", async () => {
  for (const mode of [
    "normal",
    "closed",
    "open",
    "recurse",
    "changed",
    "missing",
  ])
    for (const nested of [false, true])
      assert.deepEqual(
        await pointer(false, mode, nested),
        await pointer(true, mode, nested),
      );
});
test("input guard page helpers and inverse iframe transform retain original semantics", async () => {
  const leaf = {},
    root = { activeElement: { shadowRoot: { activeElement: leaf } } };
  assert.equal(focusedElement.call(root), source.HA.call(root));
  const element = { isConnected: true, getRootNode: () => root };
  assert.equal(elementRoot.call(element), source.pre.call(element));
  assert.equal(
    hostRoot.call({ host: element }),
    source.mre.call({ host: element }),
  );
  for (const quad of [
    [],
    [0, 0, 100, 0, 100, 100, 0, 100],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 100, 0, 90, 100, 0, 100],
  ])
    for (const point of [
      { x: 10, y: 20 },
      { x: 1.1, y: 2 },
    ])
      assert.deepEqual(
        await outcome(() =>
          iframeInputPoint(point, quad, { width: 100, height: 100 }),
        ),
        await outcome(() =>
          source.fre(point, quad, { width: 100, height: 100 }),
        ),
      );
  // Actual function text remains executable after TS erasure.
  assert.equal(
    vm.runInNewContext(
      `(${focusedElement.toString()}).call({activeElement:null})`,
    ),
    null,
  );
});
