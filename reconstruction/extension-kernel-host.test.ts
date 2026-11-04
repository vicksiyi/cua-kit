import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createKernelHostRegistry } from "../packages/browser-extension/src/kernel_host";
const settle = (p: Promise<any>) => p.then(value => ({ value }), error => ({ error: error.message, name: error.name }));
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function setup(restored: boolean, runtime: any, offscreen: any) {
  let id = 0;
  const randomUUID = () => `id-${++id}`;
  if (restored) return createKernelHostRegistry({ runtime, offscreen, randomUUID });
  const source = extensionBindings(["Jg", "Xg", "Yg", "El", "Qg", "Tl", "Dt"], { Us: undefined, chrome: { runtime, offscreen }, crypto: { randomUUID } });
  return { get: source.Yg, reset: source.El, ensureOffscreen: source.Jg };
}

test("kernel host bridge matches source responses, registry eviction and offscreen coalescing", async () => {
  for (const mode of ["success", "failure-output", "failure-default", "failure-empty", "success-empty", "bad-id", "bad-response", "reset-required", "init-timeout", "existing", "create-failure", "reset-failure"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      let created = 0;
      const runtime = {
        getURL: (path: string) => `chrome-extension://test/${path}`,
        getContexts: async (filter: any) => { trace.push(["contexts", filter]); return mode === "existing" ? [{}] : []; },
        sendMessage: async (message: any) => {
          trace.push(["send", message]);
          if (message.type === "js-kernel:reset") return { id: message.id, ok: mode !== "reset-failure", error: { name: "ResetError", message: "reset" } };
          if (mode === "bad-response") return null;
          const ok = !mode.startsWith("failure") && mode !== "init-timeout";
          return { id: mode === "bad-id" ? "wrong" : message.id, ok,
            output: ["failure-empty", "success-empty", "init-timeout"].includes(mode) ? null : { content: ["output"], error: "overwritten" },
            error: mode === "failure-default" ? undefined : { name: mode === "init-timeout" ? "JsKernelInitializationTimeoutError" : "ExecutionError", message: "execution" },
            resetRequired: mode === "reset-required" };
        },
      };
      const registry = setup(restored, runtime, { createDocument: async (options: any) => { trace.push(["create", options]); if (mode === "create-failure" && created++ === 0) throw Error("create"); } });
      const first = registry.get("scope"), second = registry.get("scope");
      const initial = await Promise.all([settle(first), settle(second)]);
      if (mode === "create-failure") { assert.deepEqual(initial, [{ error: "create", name: "Error" }, { error: "create", name: "Error" }]); }
      const kernel = await registry.get("scope");
      const same = mode === "create-failure" ? null : (await first) === (await second);
      const result = await settle(kernel.executeJs("code", undefined, { turn: "turn" }));
      const next = await registry.get("scope");
      const evicted = next !== kernel;
      const reset = await settle(registry.reset("scope"));
      const afterReset = await registry.get("scope");
      assert.notEqual(afterReset, next);
      outputs.push({ trace, result, same, evicted, reset });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("kernel execution cancellation waits for cancel delivery and preserves pre-abort behavior", async () => {
  for (const mode of ["pre-abort", "abort-running", "cancel-reject", "abort-get"]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const abort = new AbortController();
      const trace: any[] = [];
      let cancelResolve: any, cancelReject: any;
      const registry = setup(restored, {
        getURL: (path: string) => path,
        getContexts: async () => { if (mode === "abort-get") abort.abort(Error("get-abort")); return [{}]; },
        sendMessage: (message: any) => {
          trace.push(message);
          if (message.type === "js-kernel:cancel") return new Promise((resolve, reject) => { cancelResolve = resolve; cancelReject = reject; });
          return new Promise(() => {});
        },
      }, { createDocument: async () => {} });
      if (mode === "abort-get") {
        outputs.push({ result: await settle(registry.get("scope", abort.signal)), trace }); continue;
      }
      const kernel = await registry.get("scope");
      if (mode === "pre-abort") abort.abort(Error("aborted"));
      let finished = false;
      const result = settle(kernel.executeJs("script", abort.signal)).then(value => { finished = true; return value; });
      if (mode !== "pre-abort") {
        abort.abort(Error("aborted")); await flush(); assert.equal(finished, false);
        if (mode === "cancel-reject") cancelReject(Error("delivery")); else cancelResolve({});
      }
      outputs.push({ result: await result, trace });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
