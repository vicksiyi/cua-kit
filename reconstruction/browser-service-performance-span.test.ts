import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createBrowserPerformanceSpan } from "../packages/browser/src/service/runtime/performance_span";
import { BrowserAuthHandoff } from "../packages/browser/src/commands/browser_auth";
import { ManualHandoff } from "../packages/browser/src/commands/tab_control";
import { originalServiceBindings } from "./service-source";
function original(getTelemetry: () => any) {
  return originalServiceBindings(
    [
      "Sle",
      "mn",
      "Ele",
      "Tle",
      "Cle",
      "P6",
      "Ale",
      "Ple",
      "k6",
      "zo",
      "wu",
      "Rle",
      "Ile",
      "cb",
      "kle",
      "db",
      "B6",
      "qx",
      "Ble",
      "Dle",
      "R6",
      "Lx",
      "Ole",
      "xle",
      "I6",
    ],
    {
      D6: getTelemetry,
      A6: { end() {} },
      Ux: new AsyncLocalStorage(),
      mr: { Handoff: BrowserAuthHandoff },
      oe: { ManualHandoff },
    },
  );
}
const originalFactory = (get: () => any) => original(get).I6;
async function commandsScenario(factory: typeof createBrowserPerformanceSpan) {
  const trace: any[] = [];
  const api = factory(() => ({
    startSpan(name, attrs) {
      trace.push(["start", name, attrs]);
      return {
        end(result) {
          trace.push(["end", result]);
        },
      };
    },
  }));
  const cyclic: any = { value: "abc" };
  cyclic.self = cyclic;
  const results = [
    "abc",
    null,
    {
      value: ["x", cyclic, cyclic],
      values: ["hello", "世界"],
      results: [{ content: "123" }, null],
      dom_snapshot: "one\ntwo\n",
    },
    {
      status: "locator_invalid",
      locator_error: { reason: "not_user_visible" },
    },
    {
      status: "submitted",
      submission_diagnostics: {
        request_id: "r",
        submission_mode: "press_enter",
      },
    },
  ];
  for (const command of [
    ...Object.keys(original(() => undefined).xle),
    "unknown",
  ])
    for (const payload of [
      null,
      [],
      {
        tab_id: "42",
        timeout_ms: "",
        url: "https://fixture.invalid/private?q=secret",
        origin: "file:///private/file",
        submit: false,
        reason: "captcha",
      },
      {
        tab_id: "bad",
        timeout_ms: Infinity,
        url: "invalid",
        reason: "invalid",
        state: "domcontentloaded",
      },
    ])
      for (const result of results) {
        const returned = await api.withCommandTelemetry(
          command,
          payload,
          async () => {
            trace.push([
              "context",
              api.currentCommandAttrs(),
              api.currentPlaywrightOperation("fallback"),
            ]);
            return result;
          },
          { session_id: "session", turn_id: "turn" },
        );
        assert.equal(returned, result);
        assert.deepEqual(api.currentCommandAttrs(), {});
        assert.equal(api.currentPlaywrightOperation("fallback"), "fallback");
      }
  return trace;
}
test("command spans match original attribute/result projection for every original command", async () => {
  assert.deepEqual(
    await commandsScenario(createBrowserPerformanceSpan),
    await commandsScenario(originalFactory),
  );
});
async function spanScenario(factory: typeof createBrowserPerformanceSpan) {
  const trace: any[] = [];
  let host: any;
  const api = factory(() => host);
  assert.equal(await api.withSpan("absent", {}, async () => 42), 42);
  host = {
    startSpan(name: any, attrs: any) {
      trace.push(["start", name, attrs]);
      return {
        end(value: any) {
          trace.push(["end", value]);
        },
      };
    },
  };
  await api.withSpan(
    "primitives",
    {
      yes: true,
      text: "x",
      nan: NaN,
      infinite: Infinity,
      no: null,
      missing: undefined,
      object: {},
      array: [],
    },
    async () => "returned",
    { resultAttrs: () => ({ length: 8, omit: undefined }) },
  );
  for (const error of [
    new TypeError("private message"),
    "string error",
    null,
    17,
  ])
    await assert.rejects(
      api.withSpan("failure", {}, async () => {
        throw error;
      }),
      (actual) => actual === error,
    );
  const resultError = new Error("result mapping failed");
  await assert.rejects(
    api.withSpan("mapping", {}, async () => 1, {
      resultAttrs() {
        throw resultError;
      },
    }),
    (error) => error === resultError,
  );
  host = {
    startSpan() {
      throw Error("start failure");
    },
  };
  assert.equal(await api.withSpan("safe-start", {}, async () => 9), 9);
  host = {
    startSpan() {
      return {
        end() {
          throw Error("end failure");
        },
      };
    },
  };
  assert.equal(await api.withSpan("safe-end", {}, async () => 9), 9);
  host = {
    async withSpan(name: any, attrs: any, run: any, options: any) {
      assert.equal(this, host);
      trace.push(["delegated", name, attrs]);
      const result = await run();
      trace.push(["result", options.resultAttrs?.(result)]);
      return result;
    },
  };
  assert.equal(
    await api.withSpan("delegate", { yes: true, omit: null }, async () => 7, {
      resultAttrs: () => ({ raw: undefined, object: { a: 1 } }),
    }),
    7,
  );
  host = {
    withSpan() {
      throw resultError;
    },
  };
  await assert.rejects(
    api.withSpan("delegate-error", {}, async () => 7),
    (error) => error === resultError,
  );
  return trace;
}
test("span host delegation, primitive filtering and fallback failures match original", async () => {
  assert.deepEqual(
    await spanScenario(createBrowserPerformanceSpan),
    await spanScenario(originalFactory),
  );
});
async function contexts(factory: typeof createBrowserPerformanceSpan) {
  const api = factory(() => undefined),
    trace: any[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = api.withCommandTelemetry(
    "playwright_dom_snapshot",
    {},
    async () => {
      trace.push([
        "before",
        api.currentCommandAttrs(),
        api.currentPlaywrightOperation("fallback"),
      ]);
      await barrier;
      trace.push([
        "after",
        api.currentCommandAttrs(),
        api.currentPlaywrightOperation("fallback"),
      ]);
      await api.withCommandTelemetry("cua_click", {}, async () =>
        trace.push(["nested", api.currentCommandAttrs()]),
      );
      trace.push(["restored", api.currentCommandAttrs()]);
    },
  );
  await api.withCommandTelemetry("cua_type", {}, async () =>
    trace.push([
      "parallel",
      api.currentCommandAttrs(),
      api.currentPlaywrightOperation("fallback"),
    ]),
  );
  release();
  await first;
  trace.push(["outside", api.currentCommandAttrs()]);
  return trace;
}
test("command tracing preserves async, nested and concurrent context isolation", async () => {
  assert.deepEqual(
    await contexts(createBrowserPerformanceSpan),
    await contexts(originalFactory),
  );
});
