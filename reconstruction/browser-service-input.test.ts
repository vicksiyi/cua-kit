import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  createInputClass,
  quadCenter,
  mouseButtonMask,
  inputTimeout,
  inputDelay,
} from "../packages/browser/src/service/input/input";
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: { name: error?.name, message: error?.message } };
  }
}
function setup(original: boolean, options: any = {}) {
  const trace: any[] = [],
    controller = new AbortController();
  let guards = 0;
  const dependencies: any = {
    dispatchKeys: async (_cdp: any, ...args: any[]) =>
      trace.push(["keys", args]),
    resolveDomNode: async (tab: any, _cdp: any, node: any, block: any) => {
      trace.push(["resolve", tab, node, block]);
      return {
        point: { x: 10.4, y: 20.6 },
        inputPoint: { x: 1.2, y: 2.8 },
        target: options.nested
          ? { tabId: 1, sessionId: "child" }
          : { tabId: 1 },
      };
    },
    assertInputPoint: async (_cdp: any, ...args: any[]) => {
      trace.push(["guard", args]);
      if (options.guardFailure && ++guards >= 2)
        throw new Error("protected point");
    },
  };
  const cdp = {
    call: async (...args: any[]) => {
      trace.push(["call", args]);
      if (args[1] === "DOM.getContentQuads") {
        if (options.fallback) throw new Error("quads failed");
        return { quads: [[0, 0, 10, 0, 10, 20, 0, 20]] };
      }
      if (args[1] === "DOM.getBoxModel")
        return {
          model: { border: options.missing ? [] : [0, 0, 4, 0, 4, 8, 0, 8] },
        };
    },
    callTarget: async (...args: any[]) => {
      trace.push(["target", args]);
      if (args[2].type === "mousePressed") {
        if (options.abort) controller.abort(new Error("cancelled"));
        if (options.pressFailure) throw new Error("press failed");
      }
      if (args[2].type === "mouseReleased" && options.releaseFailure)
        throw new Error("release failed");
    },
    waitForPageLoadEvent: (...args: any[]) => {
      trace.push(["load", args]);
      return options.loadFailure
        ? Promise.reject(new Error("load failed"))
        : Promise.resolve();
    },
  };
  const ui = {
    moveMouse: async (...args: any[]) => {
      trace.push(["move", args]);
    },
  };
  const Constructor = original
    ? originalServiceBindings(["cg", "UF", "Zv", "Xy", "W", "Ve", "At"], {
        Os: dependencies.dispatchKeys,
        cS: dependencies.resolveDomNode,
        ru: dependencies.assertInputPoint,
      }).cg
    : createInputClass(dependencies);
  return {
    input: new Constructor(
      cdp,
      ui,
      options.wheel ? "mouseWheel" : undefined,
      !!options.block,
    ),
    trace,
    controller,
    Constructor,
  };
}
async function basic(original: boolean, options: any) {
  const { input, trace, Constructor } = setup(original, options);
  const results = [];
  results.push(
    await outcome(() =>
      input.dispatchKeyPress({ keys: [], commandName: "keypress", tabId: "1" }),
    ),
    await outcome(() =>
      input.dispatchKeyPress({
        keys: ["A"],
        commandName: "keypress",
        tabId: "1",
      }),
    ),
    await outcome(() => input.getBackendNodeViewportPoint(1, 7)),
    await outcome(() =>
      input.scrollPoint({
        tabId: "1",
        point: { x: 1.4, y: 2.8 },
        modifiers: 2,
        scrollX: -0,
        scrollY: 12,
      }),
    ),
    await outcome(() =>
      input.scrollDomCuaNode({
        tabId: 1,
        nodeId: "node",
        scrollX: 2,
        scrollY: -3,
      }),
    ),
  );
  return {
    results,
    trace,
    keys: Object.keys(input),
    methods: Object.getOwnPropertyNames(Constructor.prototype)
      .filter((name) => name !== "constructor")
      .map((name) => [
        name,
        Object.getOwnPropertyDescriptor(Constructor.prototype, name)!.value
          .length,
      ]),
  };
}
test("input class matches key validation, geometry fallback, scroll dispatch and original method shape", async () => {
  for (const options of [
    {},
    { wheel: true },
    { block: true },
    { fallback: true },
    { fallback: true, missing: true },
  ])
    assert.deepEqual(await basic(false, options), await basic(true, options));
});
async function click(original: boolean, options: any) {
  const { input, trace, controller } = setup(original, options);
  let deferred: Promise<any> | undefined;
  const result = await outcome(() =>
    options.dom
      ? input.clickDomCuaNode({
          tabId: 1,
          nodeId: "node",
          clickCount: 2,
          timeoutMs: 500,
        })
      : input.clickPoint({
          tabId: "1",
          point: { x: 10.4, y: 20.6 },
          inputPoint: { x: 1.2, y: 2.8 },
          ...(options.nested
            ? {
                inputTarget: { tabId: 1, sessionId: "child" },
                loadTarget: { tabId: 1, sessionId: "child" },
              }
            : {}),
          clickCount: 2,
          modifiers: 4,
          durationMs: options.duration ? 1 : 0,
          timeoutMs: 100,
          signal: controller.signal,
          ...(options.defer
            ? {
                deferPageLoadWait: (promise: Promise<any>) => {
                  trace.push("deferred");
                  deferred = promise;
                },
              }
            : {}),
        }),
  );
  if (deferred) await outcome(() => deferred);
  return { result, trace };
}
test("input click matches nested load waits, rounding, abort/release cleanup and deferred page loading", async () => {
  const now = Date.now;
  Date.now = () => 1000;
  try {
    for (const options of [
      {},
      { block: true, nested: true },
      { block: true, duration: true },
      { abort: true },
      { pressFailure: true },
      { releaseFailure: true },
      { loadFailure: true },
      { defer: true },
      { dom: true, nested: true, block: true },
    ])
      assert.deepEqual(await click(false, options), await click(true, options));
  } finally {
    Date.now = now;
  }
});
async function drag(original: boolean, options: any) {
  const { input, trace } = setup(original, options);
  const result = await outcome(() =>
    input.dragPath({
      tabId: "1",
      path: options.empty
        ? []
        : [
            { x: 1.2, y: 2.8 },
            { x: 5.4, y: 6.6 },
          ],
      modifiers: 1,
    }),
  );
  return { result, trace };
}
test("input drag preserves guard ordering and offscreen fallback release after protected-point failure", async () => {
  for (const options of [
    {},
    { empty: true },
    { block: true },
    { block: true, guardFailure: true },
    { pressFailure: true },
    { releaseFailure: true },
  ])
    assert.deepEqual(await drag(false, options), await drag(true, options));
});
test("input primitive helpers preserve exact quad, timeout, button and already-aborted delay semantics", async () => {
  const original = originalServiceBindings(["UF", "Ve", "Zv", "Xy"]);
  for (const quad of [
    undefined,
    null,
    [],
    [1, 2, 3, 4, 5, 6, 7, 8],
    [NaN, 0, 1, 0, 1, 2, 0, 2],
  ])
    assert.deepEqual(quadCenter(quad), original.UF(quad));
  for (const timeout_ms of [undefined, NaN, -1, 0, Infinity, 3001])
    for (const max of [undefined, 0, 500])
      assert.equal(
        inputTimeout({ timeout_ms, max }),
        original.Ve({ timeout_ms, max }),
      );
  for (const button of ["left", "middle", "right", "other"])
    assert.equal(mouseButtonMask(button), original.Zv(button));
  const controller = new AbortController();
  controller.abort(new Error("stopped"));
  for (const delay of [0, 1])
    assert.deepEqual(
      await outcome(() => inputDelay(delay, controller.signal)),
      await outcome(() => original.Xy(delay, controller.signal)),
    );
});
