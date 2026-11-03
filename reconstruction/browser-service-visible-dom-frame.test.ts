import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source";
import { createDomState } from "../packages/browser/src/service/input/dom_state";
import {
  createVisibleDomFrameReader,
  parseVisibleDomCapture,
  isVisibleDomRect,
  isVisibleDomSize,
  isVisibleFrameElement,
  isVisibleDomItem,
  childFrameTimeout,
  remainingDomTimeout,
  mainFrameKey,
  frameElementExpression,
  visibleDomException,
} from "../packages/browser/src/service/input/visible_dom_frame";
const bindings = [
  "dY",
  "CD",
  "pY",
  "mY",
  "H_",
  "W_",
  "fY",
  "hY",
  "gY",
  "bY",
  "yY",
  "wY",
  "AD",
];
const ref = originalServiceBindings(bindings, {
  _D: 500,
  vD: "const __name = (target) => target;",
});
test("visible DOM shape filters match original permissive and finite-value boundaries", () => {
  const values: any[] = [
    null,
    undefined,
    0,
    "x",
    [],
    {},
    { bottom: 5, left: 10, right: 1, top: 2 },
    { bottom: Infinity, left: 0, right: 1, top: 0 },
    { width: 1, height: 1 },
    { width: 0, height: 1 },
    { ref: "a", line: "" },
    { ref: 1, line: "x" },
    { ref: "a", rect: { bottom: 5, left: 0, right: 5, top: 0 } },
    {
      items: [{ ref: "a", line: "ok" }, {}],
      viewport: "retained",
      frameElements: [
        { ref: "a", rect: { bottom: 5, left: 0, right: 5, top: 0 } },
        null,
      ],
    },
    { items: [], viewport: 0 },
    { items: [], viewport: null },
  ];
  for (const value of values)
    for (const [fn, original] of [
      [parseVisibleDomCapture, ref.hY],
      [isVisibleDomRect, ref.wY],
      [isVisibleDomSize, ref.bY],
      [isVisibleFrameElement, ref.gY],
      [isVisibleDomItem, ref.yY],
    ])
      assert.deepEqual(fn(value), original(value));
  assert.equal(
    isVisibleDomRect({ bottom: 5, left: 10, right: 1, top: 2 }),
    true,
  );
  assert.equal(parseVisibleDomCapture({ items: [], viewport: 0 })?.viewport, 0);
});
test("visible DOM deadline, exception and serialized reference helpers match source", () => {
  const now = Date.now;
  Date.now = () => 1000;
  try {
    for (const deadline of [
      undefined,
      0,
      999,
      1000,
      1001,
      1200,
      5000,
      Infinity,
      NaN,
    ]) {
      assert.equal(remainingDomTimeout(deadline), ref.W_(deadline));
      if (deadline !== undefined)
        assert.equal(childFrameTimeout(deadline), ref.H_(deadline));
    }
  } finally {
    Date.now = now;
  }
  for (const details of [
    {},
    { text: "text" },
    { exception: { value: "value", description: "description" } },
    { exception: { value: 4, description: "" } },
  ])
    assert.equal(visibleDomException(details), ref.AD(details));
  for (const frame of [{ id: "f" }, { id: "f", loaderId: "l" }])
    assert.equal(mainFrameKey(frame), ref.fY(frame));
  for (const reviewer of [false, true])
    for (const id of ["1", 'a"b', "x\n"]) {
      assert.equal(frameElementExpression(id, reviewer), ref.mY(id, reviewer));
      const result = vm.runInNewContext(frameElementExpression(id, reviewer), {
        __browserUseVisibleDomState: {
          refToElement: new Map([[id, "ordinary"]]),
        },
        __browserUseReviewerVisibleDomState: {
          refToElement: new Map([[id, "reviewer"]]),
        },
      });
      assert.equal(result, reviewer ? "reviewer" : "ordinary");
    }
});
async function run(source: boolean, kind: string, mode: string) {
  const state = createDomState(),
    trace: any[] = [];
  const expression = (...args: any[]) => JSON.stringify(args);
  const original = originalServiceBindings(bindings, {
    _D: 500,
    vD: "const __name = (target) => target;",
    va: state.evaluate,
    cY: expression,
  });
  const reader = createVisibleDomFrameReader(expression, state);
  const cdp: any = {
    addTabCleanupHandler() {},
    async callTarget(target: any, method: string, params: any, options: any) {
      trace.push([target, method, params, options]);
      if (method === "Page.createIsolatedWorld")
        return { executionContextId: 42 };
      if (method === "Runtime.evaluate") {
        if (mode === "exception")
          return { exceptionDetails: { text: "fixture error" } };
        if (kind === "capture")
          return {
            result: {
              value: {
                items: [{ ref: "1", line: "node_id=1" }, null],
                viewport: { left: 0, top: 0, right: 100, bottom: 100 },
              },
            },
          };
        return {
          result: { objectId: mode === "no-object" ? undefined : "object-1" },
        };
      }
      if (method === "DOM.describeNode") {
        if (mode === "describe-error") throw Error("describe failed");
        return { node: { frameId: mode === "missing-frame" ? null : "child" } };
      }
      if (method === "Runtime.releaseObject" && mode === "release-error")
        throw Error("release failed");
      return {};
    },
  };
  const frame = { frameId: "main", loaderId: "loader", target: { tabId: 7 } };
  try {
    let value;
    if (kind === "capture")
      value = await (source ? original.dY : reader.capture)(
        cdp,
        frame,
        20000,
        200,
        undefined,
        false,
        300,
      );
    else if (kind === "frame")
      value = await (source ? original.CD : reader.frameId)(
        cdp,
        frame,
        "1",
        300,
        false,
      );
    else
      value = await (source ? original.pY : reader.findFrame)(
        cdp,
        frame,
        [{ ref: "1", rect: { left: 0, top: 0, right: 1, bottom: 1 } }],
        "child",
        mode === "expired" ? 0 : undefined,
        true,
      );
    return { value, trace };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("visible DOM CDP capture and frame lookup preserve isolated-world reuse and cleanup", async () => {
  for (const kind of ["capture", "frame", "find"])
    for (const mode of [
      "normal",
      "exception",
      "no-object",
      "describe-error",
      "missing-frame",
      "release-error",
      "expired",
    ])
      assert.deepEqual(
        await run(false, kind, mode),
        await run(true, kind, mode),
        `${kind}/${mode}`,
      );
  const failed = await run(false, "frame", "describe-error");
  assert.equal(failed.error, "describe failed");
  assert.equal(failed.trace.at(-1)[1], "Runtime.releaseObject");
  assert.equal((await run(false, "frame", "release-error")).value, "child");
  assert.equal((await run(false, "find", "expired")).trace.length, 0);
});
