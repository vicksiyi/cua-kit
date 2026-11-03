import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import { PlaywrightExecutionState } from "../packages/browser/src/service/playwright/execution_state";
const original = originalServiceBindings([
  "ig",
  "Fo",
  "ng",
  "og",
  "ot",
  "Fr",
  "Tne",
  "Sne",
  "Ene",
  "xne",
]);
function fixture(restored: boolean, fallback = false) {
  const cdp: any = new EventEmitter(),
    trace: any[] = [];
  let id = 0;
  const call = async (...args: any[]) => {
    trace.push(args);
    return { executionContextId: ++id, result: { value: "value" } };
  };
  cdp.call = call;
  if (!fallback) cdp.callTarget = call;
  const state: any = restored
    ? new PlaywrightExecutionState(cdp)
    : new original.ig(cdp, {}, {}, {});
  return { state, trace, cdp };
}
function dump(state: any) {
  return {
    worlds: [...state.playwrightFrameWorlds],
    readonly: [...state.readonlyExecutionContexts],
    injected: [...state.playwrightInjectedTargets],
  };
}
test("Playwright execution state preserves original frame eviction, events and document facade sharing", async () => {
  async function run(restored: boolean) {
    const { state, trace, cdp } = fixture(restored),
      snapshots: any[] = [];
    for (let i = 0; i < 52; i++) {
      await state.playwrightFrameWorld({ tabId: 1 }, `frame${i}`);
      state.playwrightInjectedTargets.add(`1:frame${i}`);
    }
    for (let i = 0; i < 22; i++)
      await state.getReadonlyExecutionContext(
        { tabId: 1, sessionId: "session", targetId: "target" },
        `frame${i}`,
        async () => i,
      );
    snapshots.push(dump(state));
    const facade = state.forDocument(cdp, "before");
    snapshots.push({
      prototype: Object.getPrototypeOf(facade) === state,
      readonlyShared:
        facade.readonlyExecutionContexts === state.readonlyExecutionContexts,
      worldsSeparate:
        facade.playwrightFrameWorlds !== state.playwrightFrameWorlds,
      ownBound: Object.hasOwn(facade, "boundSelector"),
      before: facade.beforeDocumentClick,
    });
    for (const [method, params, source] of [
      [
        "Page.frameNavigated",
        { frame: { id: "frame4", parentId: "main" } },
        { tabId: 1, sessionId: "session" },
      ],
      [
        "Page.frameDetached",
        { frameId: "frame5" },
        { tabId: 1, targetId: "target" },
      ],
      ["Target.attachedToTarget", {}, { tabId: 1 }],
      [
        "Target.detachedFromTarget",
        { sessionId: "session", targetId: "target" },
        { tabId: 1 },
      ],
      ["Runtime.executionContextsCleared", {}, { tabId: 1 }],
      ["Page.frameNavigated", { frame: { id: "main" } }, { tabId: 1 }],
    ] as any[]) {
      cdp.emit("event", { method, params, source });
      snapshots.push(dump(state));
    }
    await state.playwrightFrameWorld({ tabId: 10 }, "frame");
    await state.playwrightFrameWorld({ tabId: 1 }, "frame");
    cdp.emit("tabDetached", 1);
    snapshots.push(dump(state));
    return { trace, snapshots };
  }
  assert.deepEqual(await run(true), await run(false));
});
test("Playwright readonly context creation preserves concurrent identity, invalidation retries and error cleanup", async () => {
  async function run(restored: boolean, scenario: string) {
    const { state } = fixture(restored),
      trace: any[] = [],
      target = { tabId: 1, sessionId: "session", targetId: "target" };
    let count = 0;
    const create = async () => {
      count++;
      trace.push(count);
      if (
        count === 1 &&
        (scenario === "invalidate-success" || scenario === "invalidate-error")
      ) {
        state.clearReadonlyExecutionContexts(
          { tabId: 1, targetId: "target" },
          "frame",
        );
        if (scenario === "invalidate-error") throw Error("obsolete");
      }
      if (scenario === "error") throw Error("current");
      return count;
    };
    let result, error;
    try {
      result = await state.getReadonlyExecutionContext(target, "frame", create);
    } catch (e: any) {
      error = e.message;
    }
    const cached =
      result &&
      (await state.getReadonlyExecutionContext(target, "frame", create));
    state.invalidateReadonlyExecutionContext(target, "frame", {
      executionContextId: result?.executionContextId,
    });
    const afterWrong = dump(state);
    if (result)
      state.invalidateReadonlyExecutionContext(target, "frame", result);
    return {
      trace,
      result,
      error,
      same: cached === result,
      afterWrong,
      final: dump(state),
    };
  }
  for (const scenario of [
    "normal",
    "invalidate-success",
    "invalidate-error",
    "error",
  ])
    assert.deepEqual(
      await run(true, scenario),
      await run(false, scenario),
      scenario,
    );
  async function concurrent(restored: boolean) {
    const { state } = fixture(restored);
    let first: any, second: any;
    const a = state.getReadonlyExecutionContext(
        { tabId: 1 },
        "f",
        () => new Promise((resolve) => (first = resolve)),
      ),
      b = state.getReadonlyExecutionContext(
        { tabId: 1 },
        "f",
        () => new Promise((resolve) => (second = resolve)),
      );
    second(22);
    const rb = await b;
    first(11);
    const ra = await a;
    return { same: ra === rb, result: ra, state: dump(state) };
  }
  assert.deepEqual(await concurrent(true), await concurrent(false));
});
test("Playwright execution target evaluation preserves deadlines, cache fast path and CDP fallback", async () => {
  async function run(restored: boolean, fallback: boolean) {
    const { state, trace } = fixture(restored, fallback);
    const a = await state.callRuntimeEvaluateInExecutionTarget(
      { target: { tabId: 1 }, frameId: "frame" },
      { expression: "1" },
      { timeoutMs: 3 },
      "cache",
    );
    const cached = await state.playwrightFrameWorld({ tabId: 1 }, "frame", {
      deadlineMs: 0,
    });
    let error;
    try {
      await state.callRuntimeEvaluateInExecutionTarget(
        { target: { tabId: 1 } },
        { expression: "1" },
        { deadlineMs: 0 },
      );
    } catch (e: any) {
      error = { message: e.message, code: e.code };
    }
    return { trace, a, cached, error };
  }
  for (const fallback of [false, true])
    assert.deepEqual(await run(true, fallback), await run(false, fallback));
});

test("Playwright isolated-world execution matches original on real Chromium", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    async function run(restored: boolean) {
      const page = await browser.newPage();
      await page.setContent("<button>Target</button>");
      const session = await page.context().newCDPSession(page),
        cdp: any = new EventEmitter();
      cdp.callTarget = async (_target: any, method: string, params: any) =>
        session.send(method as any, params);
      cdp.call = async (_tab: number, method: string, params: any) =>
        session.send(method as any, params);
      const state: any = restored
        ? new PlaywrightExecutionState(cdp)
        : new original.ig(cdp, {}, {}, {});
      const { frameTree } = await session.send("Page.getFrameTree"),
        target = { target: { tabId: 1 }, frameId: frameTree.frame.id };
      const first = await state.callRuntimeEvaluateInExecutionTarget(target, {
        expression:
          'globalThis.__fixture = document.querySelector("button").textContent',
        returnByValue: true,
      });
      const second = await state.callRuntimeEvaluateInExecutionTarget(target, {
        expression: "globalThis.__fixture",
        returnByValue: true,
      });
      const main = await page.evaluate(
        () => typeof (globalThis as any).__fixture,
      );
      await page.close();
      return {
        first: first.result,
        second: second.result,
        sameContext: first.executionContextId === second.executionContextId,
        main,
      };
    }
    const expected = await run(false),
      actual = await run(true);
    assert.deepEqual(actual, expected);
    assert.equal(actual.main, "undefined");
    assert.equal(actual.first.value, "Target");
  } finally {
    await browser.close();
  }
});
