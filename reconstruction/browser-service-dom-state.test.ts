import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { serviceExpression } from "./service-source";
import {
  createDomState,
  framePoint,
  intersectClips,
  relativeClip,
} from "../packages/browser/src/service/input/dom_state";
import {
  createDomNodeResolver,
  nodePointExpression,
} from "../packages/browser/src/service/input/dom_node";
const names = [
  "lD",
  "cD",
  "dD",
  "pD",
  "mD",
  "va",
  "fD",
  "hD",
  "gD",
  "aD",
  "uD",
  "rY",
  "bD",
  "F_",
  "yD",
  "nY",
  "li",
  "b5",
  "gp",
  "L_",
  "U_",
  "cS",
  "Qne",
  "eoe",
  "toe",
  "roe",
  "Zne",
];
function original() {
  return new Function(
    'let yo=new Map(),bo=new Map(),sD=new WeakSet();const QX=50,eY=5000,tY="browser-use-dom-cua";' +
      names
        .map((name) => `const ${name}=${serviceExpression(name)};`)
        .join("\n") +
      "return{bind:lD,beginSnapshot:cD,registerFrame:dD,registerNode:pD,resolveNode:mD,evaluate:va,topLevelPoint:hD,inputPoint:gD,resolve:cS,expression:Qne,framePoint:li,intersectClips:L_,relativeClip:U_};",
  )();
}
function readable() {
  const state = createDomState();
  return {
    ...state,
    resolve: createDomNodeResolver(state),
    expression: nodePointExpression,
    framePoint,
    intersectClips,
    relativeClip,
  };
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}
const clip = { left: 0, top: 0, right: 100, bottom: 100 };
async function registry(factory: () => any) {
  const state = factory(),
    callbacks: any[] = [],
    cdp = { addTabCleanupHandler: (fn: any) => callbacks.push(fn) },
    frame = { frameId: "main", loaderId: "one", target: { tabId: 1 } };
  const trace: any[] = [];
  state.bind(cdp);
  state.bind(cdp);
  trace.push(
    callbacks.length,
    await outcome(() => state.registerNode(1, frame, "a", clip)),
  );
  state.beginSnapshot(1, "main:one");
  state.registerFrame(1, frame);
  const id = state.registerNode(1, frame, "a", clip);
  trace.push(id, state.resolveNode(1, id));
  state.beginSnapshot(1, "main:one");
  trace.push(await outcome(() => state.resolveNode(1, id)));
  trace.push(state.registerNode(1, frame, "a", clip));
  for (let i = 0; i < 5001; i++) state.registerNode(1, frame, String(i), clip);
  state.beginSnapshot(1, "main:one");
  trace.push(state.registerNode(1, frame, "a", clip));
  callbacks[0](1);
  trace.push(await outcome(() => state.resolveNode(1, "1")));
  return trace;
}
test("DOM registry preserves snapshot invalidation, stable public refs, size reset and one cleanup listener", async () => {
  assert.deepEqual(await registry(readable), await registry(original));
});
async function contexts(factory: () => any) {
  const state = factory(),
    trace: any[] = [],
    callbacks: any[] = [];
  let worlds = 0,
    fail = true;
  const cdp = {
    addTabCleanupHandler: (fn: any) => callbacks.push(fn),
    callTarget: async (...args: any[]) => {
      trace.push(args);
      if (args[1] === "Page.createIsolatedWorld")
        return { executionContextId: ++worlds };
      if (fail) {
        fail = false;
        throw new Error("Execution context was destroyed");
      }
      return { result: { value: 42 } };
    },
  };
  state.bind(cdp);
  const target = { tabId: 1 };
  for (const frame of [
    "main",
    "main",
    ...Array.from({ length: 51 }, (_, i) => String(i)),
    "main",
  ])
    await state.evaluate(cdp, target, frame, "load", "42", {
      returnByValue: true,
      timeoutMs: 17,
    });
  callbacks[0](1);
  await state.evaluate(cdp, target, "main", "load", "42", {
    returnByValue: true,
  });
  return { trace, worlds };
}
test("DOM isolated worlds preserve one retry, FIFO size limit and cleanup invalidation", async () => {
  assert.deepEqual(await contexts(readable), await contexts(original));
});
async function transform(
  factory: () => any,
  inspect: boolean,
  nested: boolean,
  missing: boolean,
) {
  const state = factory(),
    trace: any[] = [],
    frames = [
      { frameId: "main", loaderId: "a", target: { tabId: 1 } },
      {
        frameId: "parent",
        loaderId: "b",
        parentFrameId: "main",
        target: { tabId: 1 },
        size: { width: 100, height: 100 },
      },
      {
        frameId: "child",
        loaderId: "c",
        parentFrameId: "parent",
        target: nested ? { tabId: 1, sessionId: "child" } : { tabId: 1 },
        size: { width: 100, height: 100 },
      },
    ];
  state.beginSnapshot(1, "a");
  for (const frame of frames)
    if (!(missing && frame.frameId === "parent")) state.registerFrame(1, frame);
  const cdp = {
    callTarget: async (...args: any[]) => {
      trace.push(args);
      switch (args[1]) {
        case "DOM.getFrameOwner":
          return { backendNodeId: 1 };
        case "DOM.getContentQuads":
          return { quads: [[10, 20, 210, 20, 210, 220, 10, 220]] };
        case "DOM.getBoxModel":
          return { model: { content: [10, 20, 210, 20, 210, 220, 10, 220] } };
        case "Page.createIsolatedWorld":
          return { executionContextId: 1 };
        case "Runtime.evaluate":
          return { result: { value: { width: 100, height: 100 } } };
      }
    },
    addTabCleanupHandler: () => {},
  };
  return {
    input: await outcome(() =>
      state.inputPoint(1, cdp, "child", { x: 5, y: 10 }, inspect),
    ),
    top: await outcome(() =>
      state.topLevelPoint(1, cdp, "child", { x: 5, y: 10 }, inspect),
    ),
    trace,
  };
}
test("DOM frame coordinates preserve target boundaries, parent skipping and inspected viewport mapping", async () => {
  for (const inspect of [true, false])
    for (const nested of [true, false])
      for (const missing of [true, false])
        assert.deepEqual(
          await transform(readable, inspect, nested, missing),
          await transform(original, inspect, nested, missing),
        );
});
function expression(api: any, connected: boolean, rects: any[]) {
  const trace: any[] = [],
    element = {
      isConnected: connected,
      scrollIntoView: (arg: any) => trace.push(arg),
      getClientRects: () => rects,
      getBoundingClientRect: () => ({
        width: 20,
        height: 20,
        left: 10,
        right: 30,
        top: 10,
        bottom: 30,
      }),
    };
  const value = vm.runInNewContext(api.expression("a", clip), {
    __browserUseVisibleDomState: { refToElement: new Map([["a", element]]) },
  });
  return {
    value: JSON.parse(JSON.stringify(value)),
    trace: JSON.parse(JSON.stringify(trace)),
  };
}
test("DOM node injected expression keeps first visible clipped rect and bounding-rect fallback", () => {
  for (const connected of [true, false])
    for (const rects of [
      [],
      [{ width: 0, height: 0 }],
      [{ width: 30, height: 30, left: 90, right: 120, top: 90, bottom: 120 }],
    ])
      assert.deepEqual(
        expression(readable(), connected, rects),
        expression(original(), connected, rects),
      );
});
async function resolve(factory: () => any, mode: string) {
  const state = factory(),
    frame = { frameId: "main", loaderId: "load", target: { tabId: 1 } };
  state.beginSnapshot(1, "main");
  state.registerFrame(1, frame);
  const id = state.registerNode(1, frame, "a", clip),
    trace: any[] = [];
  const cdp = {
    addTabCleanupHandler: () => {},
    callTarget: async (_target: any, method: string, params: any) => {
      trace.push(method);
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: 7 };
      if (mode === "error")
        return { exceptionDetails: { exception: { value: "node failed" } } };
      return {
        result: {
          value:
            mode === "stale"
              ? null
              : vm.runInNewContext(params.expression, {
                  __browserUseVisibleDomState: {
                    refToElement: new Map([
                      [
                        "a",
                        {
                          isConnected: true,
                          scrollIntoView: () => {},
                          getClientRects: () => [
                            {
                              width: 10,
                              height: 20,
                              left: 0,
                              right: 10,
                              top: 0,
                              bottom: 20,
                            },
                          ],
                        },
                      ],
                    ]),
                  },
                }),
        },
      };
    },
  };
  return { result: await outcome(() => state.resolve(1, cdp, id)), trace };
}
test("DOM resolver combines original registry, isolated evaluation and coordinate transforms", async () => {
  for (const mode of ["valid", "stale", "error"])
    assert.deepEqual(
      await resolve(readable, mode),
      await resolve(original, mode),
    );
});
