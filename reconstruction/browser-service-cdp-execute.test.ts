import test from "node:test";
import assert from "node:assert/strict";
import {
  originalServiceBindings,
  serviceClassMethod,
  serviceClassWithMethods,
  serviceSourceSha256,
} from "./service-source.ts";
import * as timing from "../packages/browser/src/service/cdp/deadline";
import * as helpers from "../packages/browser/src/service/cdp/dispatch_helpers";
import { createCdpExecutionMethods } from "../packages/browser/src/service/cdp/execute_methods";
import { classifyCommandError } from "../packages/browser/src/service/classify_error";
assert.equal(serviceSourceSha256, "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
  "Re-audit CDP dispatch helper bindings for changed browser-service artifact");
const sourceClass = serviceClassWithMethods(["executeTargetCdp", "waitForTabAttachment", "ensureAttachedTab", "attachTab", "callRawCdp", "rawCdpTarget"]);
const source = originalServiceBindings([
  "Bv",
  "nu",
  "jh",
  "Ht",
  "ou",
  "Dv",
  "ZN",
  "Mv",
  "_t",
  "e2",
  "xte",
  "Tte",
  "o2",
]);
function originalMethods(report: any) {
  const names = [
    "call",
    "callTarget",
    "callRawCdp",
    "forDocument",
    "executeTargetCdp",
    "rawCdpTarget",
  ];
  const deps = { ...source, ru: classifyCommandError, dt: report };
  return new Function(
    ...Object.keys(deps),
    "return {" +
      names.map((name) => serviceClassMethod(sourceClass, name)).join(",") +
      "};",
  )(...Object.values(deps));
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error) {
    return {
      error:
        typeof error === "object" && error !== null
          ? { name: error.name, message: error.message }
          : error,
    };
  }
}
test("CDP deadline helpers retain boundary checks, beforeDispatch ordering, timer race and original errors", async () => {
  const now = Date.now;
  Date.now = () => 1000;
  try {
    for (const options of [
      {},
      { timeoutMs: 0 },
      { timeoutMs: 30, deadlineMs: 1100 },
      { timeoutMs: 300, deadlineMs: 1100 },
      { deadlineMs: 1000 },
      { deadlineMs: 999 },
      { deadlineMs: NaN },
    ])
      assert.deepEqual(
        await outcome(() => timing.remainingCdpTimeout(options)),
        await outcome(() => source.Dv(options)),
      );
    for (const fn of [timing.dispatchTimeout, source.ou]) {
      let ran = false;
      assert.throws(() =>
        fn({
          deadlineMs: 999,
          beforeDispatch() {
            ran = true;
          },
        }),
      );
      assert.equal(ran, true);
    }
    for (const [ours, theirs] of [[timing.awaitCdpDeadline, source.Mv]]) {
      assert.deepEqual(
        await outcome(() => ours(Promise.resolve("ok"), { deadlineMs: 1005 })),
        await outcome(() =>
          theirs(Promise.resolve("ok"), { deadlineMs: 1005 }),
        ),
      );
      assert.deepEqual(
        await outcome(() => ours(new Promise(() => {}), { deadlineMs: 1005 })),
        await outcome(() =>
          theirs(new Promise(() => {}), { deadlineMs: 1005 }),
        ),
      );
      assert.deepEqual(
        await outcome(() =>
          ours(Promise.reject(new Error("underlying")), { deadlineMs: 999 }),
        ),
        await outcome(() =>
          theirs(Promise.reject(new Error("underlying")), { deadlineMs: 999 }),
        ),
      );
    }
    for (const error of [
      new Error("Deadline exceeded"),
      "TIMED OUT",
      {},
      null,
      "timeout",
    ])
      assert.equal(timing.isDeadlineError(error), source.jh(error));
    const inherited = Object.create({ expression: "1" });
    for (const params of [
      undefined,
      null,
      {},
      inherited,
      { expression: 4 },
      { expression: "1", awaitPromise: true, returnByValue: false },
    ]) {
      assert.equal(helpers.hasCdpExpression(params), source.o2(params));
      assert.deepEqual(
        helpers.evaluationTelemetry("Runtime.evaluate", params),
        source.Tte("Runtime.evaluate", params),
      );
    }
  } finally {
    Date.now = now;
  }
});
function fixture(create: any, config: any = {}) {
  const calls: any[] = [],
    reports: any[] = [];
  let attachedCalls = 0,
    executeCalls = 0;
  const state: any = {
    attachedTabIds: new Set([1]),
    tabAttachmentPromises: new Map([[1, Promise.resolve()]]),
    rawScreencastTabIds: new Set(),
    frameSessionsBySessionId: new Map([
      ["s", { target: { tabId: 1, sessionId: "s" } }],
    ]),
    frameSessionsByTabId: new Map([
      [1, new Map([["t", { target: { tabId: 1, targetId: "t" } }]])],
    ]),
    throwIfJsDialogBlocksMethod(id: any, method: any) {
      calls.push(["dialog", id, method]);
      if (config.dialog) throw new Error("dialog");
    },
    async waitForTabAttachment(id: any, options: any) {
      calls.push(["attach", id]);
      attachedCalls++;
      if (
        config.attachFail &&
        (config.attachFail === "always" || attachedCalls === 1)
      )
        throw "Debugger unattached";
    },
    forgetAttachedTab(id: any) {
      calls.push(["forget", id]);
      this.attachedTabIds.delete(id);
      this.tabAttachmentPromises.delete(id);
    },
    async withScreencastLock(id: any, run: any) {
      calls.push(["lock", id]);
      try {
        return await run();
      } finally {
        calls.push(["unlock", id]);
      }
    },
    performanceSpan: {
      currentCommandAttrs() {
        return { current: "command", "browser_use.tab.id": "override" };
      },
      async withSpan(name: any, attrs: any, run: any) {
        calls.push(["span", name, attrs]);
        return await run();
      },
    },
    api: {
      async executeCdp(payload: any) {
        executeCalls++;
        calls.push(["execute", payload]);
        if (config.replacePromise)
          state.tabAttachmentPromises.set(1, Promise.resolve());
        if (config.failure && (config.always || executeCalls === 1))
          throw config.failure;
        return { result: "ok" };
      },
      async executeCdpWithCachedExpression(payload: any, key: any) {
        calls.push(["cached", payload, key]);
        return { cached: true };
      },
    },
  };
  Object.assign(
    state,
    create((error: any, metadata: any) =>
      reports.push({ name: error.name, message: error.message, metadata }),
    ),
  );
  return { state, calls, reports };
}
async function scenario(
  create: any,
  setupToken: symbol,
  config: any = {},
  target: any = { tabId: 1 },
  extra: any = {},
) {
  const f = fixture(create, config),
    options: any = {
      timeoutMs: 100,
      deadlineMs: 2000,
      telemetryAttrs: { custom: true },
      beforeDispatch() {
        f.calls.push("before");
      },
      prepareDispatch: async () => {
        f.calls.push("prepare");
      },
      ...extra,
    };
  if (config.setupToken) options[setupToken] = 1;
  if (config.document)
    f.state = f.state.forDocument({ tabId: 1, targetId: "document" });
  const result = await outcome(() =>
    f.state.executeTargetCdp(
      target,
      "Runtime.evaluate",
      config.params ?? {
        expression: "1",
        awaitPromise: true,
        returnByValue: true,
      },
      options,
    ),
  );
  return { result, calls: f.calls, reports: f.reports };
}
test("CDP dispatch preserves attach retry eligibility, document target, cached expressions and telemetry ordering", async () => {
  const now = Date.now;
  Date.now = () => 1000;
  try {
    for (const config of [
      {},
      { attachFail: true },
      { attachFail: "always" },
      { failure: "Debugger unattached" },
      { failure: "Debugger is not attached to target" },
      { failure: "Debugger unattached", always: true },
      { failure: "Debugger unattached", replacePromise: true },
      { failure: "Debugger unattached", setupToken: true },
      { attachFail: true, setupToken: true },
      { document: true },
      { dialog: true },
    ])
      for (const target of [{ tabId: 1 }, { tabId: 1, sessionId: "s" }])
        assert.deepEqual(
          await scenario(
            createCdpExecutionMethods,
            timing.tabAttachmentSetup,
            config,
            target,
          ),
          await scenario(originalMethods, source.nu, config, target),
        );
    for (const params of [{ expression: "2" }, {}])
      assert.deepEqual(
        await scenario(
          createCdpExecutionMethods,
          timing.tabAttachmentSetup,
          { params },
          undefined,
          { expressionCacheKey: "key" },
        ),
        await scenario(originalMethods, source.nu, { params }, undefined, {
          expressionCacheKey: "key",
        }),
      );
    for (const attrs of [{}, { "browser_use.cdp.method": "full" }])
      assert.deepEqual(
        await scenario(
          createCdpExecutionMethods,
          timing.tabAttachmentSetup,
          { failure: 'Timed out running CDP command "Runtime.evaluate"' },
          undefined,
          { telemetryAttrs: attrs },
        ),
        await scenario(
          originalMethods,
          source.nu,
          { failure: 'Timed out running CDP command "Runtime.evaluate"' },
          undefined,
          { telemetryAttrs: attrs },
        ),
      );
  } finally {
    Date.now = now;
  }
});
async function rawScenario(create: any) {
  const f = fixture(create),
    results = [];
  for (const target of [
    undefined,
    { sessionId: "s" },
    { targetId: "t" },
    { sessionId: "bad" },
    { targetId: "bad" },
    { sessionId: "s", targetId: "t" },
  ])
    results.push(
      await outcome(() =>
        f.state.callRawCdp(
          "1",
          "Runtime.evaluate",
          { expression: "1" },
          {
            target,
            telemetryAttrs: {
              secret: "kept",
              "browser_use.cdp.method": "caller",
            },
          },
        ),
      ),
    );
  results.push(await f.state.call("1", "Page.getLayoutMetrics"));
  await f.state.callRawCdp(1, "Page.startScreencast");
  results.push([...f.state.rawScreencastTabIds]);
  await f.state.callRawCdp(1, "Page.stopScreencast");
  results.push([...f.state.rawScreencastTabIds]);
  results.push(
    await outcome(() => f.state.call("bad", "Page.getLayoutMetrics")),
    await outcome(() => f.state.callRawCdp("bad", "Page.getLayoutMetrics")),
  );
  return { results, calls: f.calls, reports: f.reports };
}
test("raw CDP routes only attached targets, forces debugger preservation and serializes screencast ownership", async () => {
  assert.deepEqual(
    await rawScenario(createCdpExecutionMethods),
    await rawScenario(originalMethods),
  );
});
test("document scoped execution uses a non-enumerable immutable inherited override", () => {
  for (const create of [createCdpExecutionMethods, originalMethods]) {
    const { state } = fixture(create);
    const target = { tabId: 1, targetId: "doc" },
      scoped = state.forDocument(target);
    assert.equal(Object.getPrototypeOf(scoped), state);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(scoped, "documentTarget"),
      {
        value: target,
        writable: false,
        enumerable: false,
        configurable: false,
      },
    );
  }
});

test("detach retry is bounded and distinguishes transport text from Error objects", async () => {
  for (const [failure, expectedDispatches] of [
    ["Debugger unattached", 2],
    ["Debugger is not attached to target", 2],
    ["Detached while handling command", 1],
    [new Error("Debugger unattached"), 1],
  ] as const) {
    const outcomes = [];
    for (const create of [createCdpExecutionMethods, originalMethods]) {
      const f = fixture(create, { failure, always: true });
      const result = await outcome(() => f.state.executeTargetCdp({ tabId: 1 }, "Runtime.evaluate", { expression: "1" }));
      assert.equal(f.calls.filter((call: any) => call[0] === "execute").length, expectedDispatches);
      outcomes.push({ result, calls: f.calls, reports: f.reports });
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
});
