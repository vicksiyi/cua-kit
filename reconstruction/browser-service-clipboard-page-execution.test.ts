import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { originalServiceBindings } from "./service-source";
import {
  executeClipboardPage,
  credentialFieldPolicy,
  isCredentialField,
} from "../packages/browser/src/service/clipboard/page_execution";
const original = originalServiceBindings(["U5", "yl", "no", "Ms"]);
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("clipboard page execution preserves bridge install, serialized expression and result/error protocol", async () => {
  const responses = [
    { result: { value: { ok: true, data: { items: [] } } } },
    { result: { value: { ok: true } } },
    { result: { value: { ok: false, error: "page error" } } },
    { result: { value: { ok: 1, error: 3 } } },
    { result: { value: null } },
    { result: { value: "bad" } },
    {
      exceptionDetails: {
        exception: { description: "description", value: "value" },
        text: "text",
      },
    },
    { exceptionDetails: { exception: { value: false } } },
    { exceptionDetails: { text: "text" } },
    { exceptionDetails: {} },
  ];
  for (const response of responses)
    for (const executionContextId of [undefined, 0, 7]) {
      async function run(fn: typeof executeClipboardPage) {
        const trace: any[] = [];
        const ctx: any = {
          clipboard: {
            async ensurePageClipboard(_cdp: any, target: any) {
              trace.push(["install", target]);
            },
          },
          cdp: {
            async callTarget(...args: any[]) {
              trace.push(args);
              return response;
            },
          },
        };
        return {
          result: await outcome(() =>
            fn({
              args: { text: "hello" },
              commandType: "test",
              ctx,
              pageFunction: function (args: any) {
                return args;
              },
              tabId: 1,
              target: { tabId: 1, sessionId: "frame" },
              executionContextId,
            }),
          ),
          trace,
        };
      }
      assert.deepEqual(await run(executeClipboardPage), await run(original.yl));
    }
});
test("clipboard serialized page wrapper executes async return and error values", async () => {
  for (const pageFunction of [
    async (args: any) => ({ text: args.text }),
    async () => {
      throw Error("failed");
    },
    async () => {
      throw "literal";
    },
    async () => undefined,
  ]) {
    async function run(fn: typeof executeClipboardPage) {
      const ctx: any = {
        clipboard: { async ensurePageClipboard() {} },
        cdp: {
          async callTarget(_t: any, _m: any, params: any) {
            return {
              result: {
                value: structuredClone(
                  await runInNewContext(params.expression),
                ),
              },
            };
          },
        },
      };
      return outcome(() =>
        fn({
          args: { text: "你好" },
          commandType: "test",
          ctx,
          pageFunction,
          tabId: 1,
        }),
      );
    }
    assert.deepEqual(await run(executeClipboardPage), await run(original.yl));
  }
});
test("credential field classification matches original policy without broadening tags", () => {
  assert.deepEqual(credentialFieldPolicy, original.no);
  for (const tag of ["INPUT", "textarea", "select", "DIV"])
    for (const attrs of [
      {},
      { type: "HIDDEN" },
      { name: "email" },
      { placeholder: "one-time-code" },
      { "aria-label": "username" },
      { id: "ordinary" },
      { title: "Phone" },
      { name: "telescopic" },
    ]) {
      const element: any = {
        tagName: tag,
        getAttribute: (key: string) => (attrs as any)[key] ?? null,
      };
      assert.equal(
        isCredentialField(element, credentialFieldPolicy),
        original.Ms(element, original.no),
      );
    }
});
