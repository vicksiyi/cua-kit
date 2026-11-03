import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { originalServiceBindings, serviceExpression } from "./service-source";
import {
  dispatchAxText,
  createInputTargetToken,
} from "../packages/browser/src/service/input/text_input";

const original = originalServiceBindings(["A5", "hl", "GA"]).GA;
async function run(
  fn: typeof dispatchAxText,
  text: string,
  abortAt = -1,
  failAt = -1,
  token?: string,
) {
  const controller = new AbortController();
  const trace: unknown[] = [];
  if (abortAt === 0) controller.abort(new Error("cancelled"));
  let error: string | undefined;
  try {
    await fn(
      {
        async callTarget(...args) {
          trace.push(args);
          if (trace.length === abortAt)
            controller.abort(new Error("cancelled"));
          if (trace.length === failAt) throw new Error("dispatch failed");
        },
      },
      { target: { tabId: 7, sessionId: "frame" }, inputTargetToken: token },
      text,
      controller.signal,
    );
  } catch (caught: any) {
    error = caught.message;
  }
  return { trace, error };
}

test("AX text preserves original event payloads, Unicode and line ending normalization", async () => {
  for (const text of [
    "",
    "abc",
    "你好😀",
    "\tA\r\nB\rC\n",
    "\n\t",
    "a\u0000",
    "\u001f",
    "\u007f",
  ])
    for (const token of [undefined, "expected-target"])
      assert.deepEqual(
        await run(dispatchAxText, text, -1, -1, token),
        await run(original, text, -1, -1, token),
      );
  const result = await run(dispatchAxText, "ab");
  assert.equal(result.trace.length, 4);
  assert.equal((await run(dispatchAxText, "a\u0000")).trace.length, 0);
});

test("AX text preserves cancellation and dispatch failure boundaries without invented cleanup", async () => {
  for (let index = 0; index <= 10; index++) {
    assert.deepEqual(
      await run(dispatchAxText, "a\tb\nc", index),
      await run(original, "a\tb\nc", index),
    );
    assert.deepEqual(
      await run(dispatchAxText, "a\tb\nc", -1, index),
      await run(original, "a\tb\nc", -1, index),
    );
  }
  assert.deepEqual(
    await run(dispatchAxText, "", 0),
    await run(original, "", 0),
  );
  assert.deepEqual(
    await run(dispatchAxText, "\u0000", 0),
    await run(original, "\u0000", 0),
  );
});

test("input tokens preserve strict enablement, UUID preference and fallback sequence", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const now = Date.now,
    random = Math.random;
  try {
    Date.now = () => 1234;
    Math.random = () => 0.5;
    for (const crypto of [{ randomUUID: () => "uuid" }, undefined]) {
      Object.defineProperty(globalThis, "crypto", {
        value: crypto,
        configurable: true,
      });
      const source = runInNewContext(
        `var WA = 0; (${serviceExpression("fl")})`,
        { crypto, Date, Math },
      );
      for (const enabled of [undefined, false, 1, "true", true, true])
        assert.equal(createInputTargetToken(enabled as any), source(enabled));
    }
  } finally {
    Date.now = now;
    Math.random = random;
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
