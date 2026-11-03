import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings, serviceExpression } from "./service-source";
import { PlaywrightService } from "../packages/browser/src/service/playwright/service";
import {
  evaluateReadonlyPage,
  evaluateReadonlySelector,
  readonlyResult,
  releaseReadonlyObjects,
  readonlyCleanupOptions,
} from "../packages/browser/src/service/readonly/runtime";
import { readonlyExpression } from "../packages/browser/src/service/readonly/expression";
const original = originalServiceBindings(
  [
    "Hne",
    "Wne",
    "sS",
    "aS",
    "$ne",
    "PF",
    "RF",
    "ag",
    "CF",
    "$n",
    "IF",
    "Gne",
    "BF",
    "DF",
    "zne",
    "sg",
    "Fr",
    "Tne",
    "TF",
    "Lne",
    "Une",
  ],
  {
    jne: 0,
    eg: { expression: "INSTALL", awaitPromise: true, returnByValue: true },
    Vne: readonlyExpression,
    uS: readonlyExpression,
  },
);
async function outcome(run: () => Promise<any>) {
  try {
    return { value: await run() };
  } catch (e) {
    return { error: (e as any).message, code: (e as any).code };
  }
}
function normalize(value: any): any {
  if (typeof value === "string")
    return value.replace(/__browserUseReadonlyElement\d+/g, "__binding");
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item)]),
    );
  return value;
}
test("readonly runtime preserves CDP order, bounded recovery, node binding and cleanup", async () => {
  const now = Date.now,
    timer = globalThis.setTimeout;
  try {
    for (const scenario of [
      "page",
      "prepared",
      "destroyed",
      "exception-result",
      "selector",
      "wrong-document",
      "wrong-twice",
      "terminal",
      "timeout",
      "bind-error",
      "missing-node",
      "cleanup-error",
    ]) {
      async function run(restored: boolean) {
        let time = 1000,
          failures = 0;
        Date.now = () => time;
        const calls: any[] = [];
        globalThis.setTimeout = ((callback: any, delay: number) => {
          calls.push(["sleep", delay]);
          time += delay;
          callback();
          return 0;
        }) as any;
        const cdp: any = {
          async call(tab: any, ...args: any[]) {
            return await dispatch({ tabId: tab }, ...args);
          },
          async callTarget(target: any, ...args: any[]) {
            return await dispatch(target, ...args);
          },
        };
        async function dispatch(
          target: any,
          method: string,
          params: any,
          options: any,
        ) {
          calls.push(["cdp", target, method, params, options]);
          if (method === "Page.getFrameTree")
            return { frameTree: { frame: { id: "root" } } };
          if (method === "Page.createIsolatedWorld")
            return { executionContextId: 7 };
          if (method === "DOM.resolveNode") {
            if (
              (scenario === "wrong-document" && failures++ === 0) ||
              (scenario === "wrong-twice" && failures++ < 2)
            )
              throw Error("Node with given id does not belong to the document");
            return {
              object: scenario === "missing-node" ? {} : { objectId: "node" },
            };
          }
          if (method === "Runtime.callFunctionOn")
            return scenario === "bind-error"
              ? {
                  exceptionDetails: {
                    text: "binding failed",
                    exception: { objectId: "error" },
                  },
                }
              : { result: { value: undefined } };
          if (method === "Runtime.releaseObject") {
            if (scenario === "cleanup-error") throw Error("cleanup failed");
            return {};
          }
          if (method === "Runtime.evaluate") {
            if (params.expression.startsWith("delete ")) return {};
            if (scenario === "destroyed" && failures++ === 0)
              throw Error("Execution context was destroyed");
            return scenario === "exception-result"
              ? { exceptionDetails: { text: "script failed" } }
              : { result: { value: 42 } };
          }
          throw Error(method);
        }
        const context: any = {
          cdp,
          commandTiming: {
            startLocatorRetry() {
              calls.push(["start"]);
              return {
                finish(status: string) {
                  calls.push(["finish", status]);
                },
                attemptFailed() {
                  calls.push(["failed"]);
                },
              };
            },
          },
          playwright: {
            installation: {
              expression: "INSTALL",
              awaitPromise: true,
              returnByValue: true,
            },
            async getReadonlyExecutionContext(
              target: any,
              frame: any,
              create: any,
            ) {
              calls.push(["world", target, frame]);
              return { executionContextId: await create() };
            },
            invalidateReadonlyExecutionContext(...args: any[]) {
              calls.push(["invalidate", ...args]);
            },
            async resolvePlaywrightSelectorNode(...args: any[]) {
              calls.push(["resolve", ...args]);
              if (scenario === "terminal")
                throw Error("strict mode violation: multiple");
              if (scenario === "timeout") {
                time = 1300;
                throw Error("not found");
              }
              return {
                backendNodeId: 9,
                target: { tabId: 1, sessionId: "child" },
                frameId: "child",
              };
            },
          },
        };
        const isPage = [
          "page",
          "prepared",
          "destroyed",
          "exception-result",
        ].includes(scenario);
        const result = await outcome(() =>
          isPage
            ? (restored ? evaluateReadonlyPage : original.Hne)(
                context,
                1,
                "return 42",
                1300,
                300,
                scenario === "prepared"
                  ? {
                      target: { tabId: 1 },
                      frameId: "root",
                      expression: "PREPARED",
                    }
                  : undefined,
              )
            : (restored ? evaluateReadonlySelector : original.Wne)(
                context,
                1,
                "button",
                "return element.id",
                1300,
                300,
              ),
        );
        return normalize({ result, calls });
      }
      assert.deepEqual(await run(true), await run(false), scenario);
    }
  } finally {
    Date.now = now;
    globalThis.setTimeout = timer;
  }
});
test("readonly runtime result extraction preserves errors and non-JSON primitives", () => {
  for (const result of [
    undefined,
    { value: 3 },
    { unserializableValue: "-0" },
    { unserializableValue: "NaN" },
    { unserializableValue: "Infinity" },
    { unserializableValue: "-123n" },
    { unserializableValue: "other" },
  ])
    assert.deepEqual(readonlyResult({ result }), original.DF({ result }));
  assert.throws(
    () =>
      readonlyResult({
        exceptionDetails: {
          text: "fallback",
          exception: { description: "specific" },
        },
      }),
    /^Error: specific$/,
  );
});
test("readonly host executes page, node and collection in real managed Chromium worlds", async () => {
  const browser = await chromium.launch({ headless: true }),
    source = new Function(`return (${serviceExpression("hF")})`)();
  try {
    for (const scenario of ["page", "selector", "collection", "error"]) {
      const page = await browser.newPage();
      try {
        await page.setContent(
          "<button id=one>One</button><button id=two>Two</button>",
        );
        const session = await page.context().newCDPSession(page),
          cdp: any = {
            platform: "darwin",
            addListener() {},
            async call(_tab: any, method: string, params: any) {
              return session.send(method as any, params);
            },
            async callTarget(_target: any, method: string, params: any) {
              return session.send(method as any, params);
            },
          },
          timing = {
            startLocatorRetry() {
              return { finish() {}, attemptFailed() {} };
            },
          },
          service = new PlaywrightService(
            cdp,
            source,
            timing,
            { currentPlaywrightOperation: () => "readonly" },
            {
              async clickPoint() {
                throw Error("not used");
              },
            },
          ),
          context = { cdp, commandTiming: timing, playwright: service };
        const deadline = Date.now() + 3000;
        const prepared =
          scenario === "collection"
            ? await service.prepareReadonlyLocatorAll(
                1,
                "button",
                readonlyExpression(
                  "return elements.map(item=>item.id)",
                  undefined,
                  "elements",
                  "selectorScope?.root?.defaultView ?? globalThis",
                ),
                { timeoutMs: 3000, deadlineMs: deadline },
              )
            : undefined;
        const response =
          scenario === "selector"
            ? await evaluateReadonlySelector(
                context,
                1,
                "#one",
                "return element.id",
                deadline,
                3000,
              )
            : await evaluateReadonlyPage(
                context,
                1,
                scenario === "error"
                  ? "throw new Error('expected')"
                  : "return document.querySelectorAll('button').length",
                deadline,
                3000,
                prepared,
              );
        if (scenario === "error")
          assert.throws(
            () => readonlyResult(response.runtimeResult),
            /expected/,
          );
        else
          assert.deepEqual(
            readonlyResult(response.runtimeResult),
            scenario === "page"
              ? 2
              : scenario === "selector"
                ? "one"
                : ["one", "two"],
          );
        await releaseReadonlyObjects(
          context,
          response.evaluationTarget.target,
          [
            response.runtimeResult.result?.objectId,
            response.runtimeResult.exceptionDetails?.exception?.objectId,
          ],
          readonlyCleanupOptions(),
        );
        const world = await service.getReadonlyExecutionContext(
          response.evaluationTarget.target,
          response.evaluationTarget.frameId,
          async () => {
            throw Error("should use cache");
          },
        );
        const bindings = await session.send("Runtime.evaluate", {
          contextId: world.executionContextId,
          expression:
            "Object.keys(globalThis).filter(key=>key.startsWith('__browserUseReadonlyElement'))",
          returnByValue: true,
        });
        assert.deepEqual(bindings.result.value, []);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("readonly command authorizes before validation and releases results even on script failure", async () => {
  const { PlaywrightEvaluateCommand } =
    await import("../packages/browser/src/service/commands/readonly_evaluate");
  for (const scenario of [
    "denied",
    "import",
    "missing-selector",
    "success",
    "script-error",
  ]) {
    const calls: any[] = [];
    const context: any = {
      acquireAuthority() {
        calls.push("authority");
        return {
          observeContent(url: any) {
            calls.push(["observe", url]);
            return {
              async assert() {
                calls.push("assert");
                if (scenario === "denied") throw Error("denied");
              },
            };
          },
        };
      },
      security: {
        async currentTabUrl(tab: any) {
          calls.push(["url", tab]);
          return "https://example.test";
        },
      },
      playwright: {
        async getReadonlyExecutionContext(
          _target: any,
          _frame: any,
          create: any,
        ) {
          return { executionContextId: await create() };
        },
      },
      cdp: {
        async call(_tab: any, method: string, params: any) {
          calls.push(["cdp", method]);
          if (method === "Page.getFrameTree")
            return { frameTree: { frame: { id: "main" } } };
          if (method === "Page.createIsolatedWorld")
            return { executionContextId: 7 };
          if (method === "Runtime.releaseObject") {
            assert.equal(params.objectId, "result");
            return {};
          }
          return scenario === "script-error"
            ? {
                exceptionDetails: {
                  text: "script failed",
                  exception: { objectId: "result" },
                },
              }
            : { result: { objectId: "result", value: 42 } };
        },
      },
    };
    const result = await outcome(() =>
      PlaywrightEvaluateCommand(
        {
          tab_id: 1,
          script: scenario === "import" ? "return import('x')" : "return 42",
          selector_mode: scenario === "missing-selector" ? "all" : undefined,
        },
        context,
      ),
    );
    assert.deepEqual(calls.slice(0, 4), [
      "authority",
      ["url", 1],
      ["observe", "https://example.test"],
      "assert",
    ]);
    if (["denied", "import", "missing-selector"].includes(scenario)) {
      assert.equal(calls.length, 4);
      assert.ok("error" in result);
    } else {
      assert.deepEqual(calls.at(-1), ["cdp", "Runtime.releaseObject"]);
      if (scenario === "success")
        assert.deepEqual(result, { value: { value: 42 } });
      else assert.equal((result as any).error, "script failed");
    }
  }
});
