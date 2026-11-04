import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createSiwcServiceClass } from "../packages/browser-extension/src/siwc";
import { createChatApiClass } from "../packages/browser-extension/src/chat_api";
const settle = async (operation: Promise<any>) => {
  try {
    return { value: await operation };
  } catch (error: any) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      retryAfterMs: error.retryAfterMs,
      retryable: error.retryable,
    };
  }
};
test("cached auth reader matches request-generation invalidation, retained rejection and waiter cancellation", async () => {
  const results = [];
  for (const original of [true, false]) {
    const calls: any[] = [];
    let release!: () => void;
    let gate: Promise<void> | undefined;
    let fail = false;
    const fetch = async (url: string, init: any) => {
      calls.push([url, init.signal.aborted]);
      await gate;
      if (fail) throw Error("fixture-offline");
      return new Response("{}");
    };
    let create: any, direct: any;
    if (original) {
      const bindings = extensionBindings(["Qc", "el", "Pr", "Xc"], {
        fetch,
        Ss: 0,
        Jc: 15000,
        Or: "https://chatgpt.com",
      });
      create = bindings.Xc;
      direct = bindings.Pr;
    } else {
      const restored = createSiwcServiceClass({
        fetch: fetch as any,
        chrome: {} as any,
        crypto: {} as any,
      });
      create = restored.createCachedAuthReader;
      direct = restored.readAuthSession;
    }
    const a = create(),
      b = create();
    const values = [];
    values.push(await a(), await a());
    assert.equal(calls.length, 1);
    values.push(await b(), await a()); // other reader's direct fetch invalidates a
    assert.equal(calls.length, 3);
    values.push(
      await direct(),
      await a(),
      await a(undefined, "https://alternate.test"),
    );
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const abort = new AbortController();
    const waiting = settle(a(abort.signal, "https://pending.test"));
    const survivor = a(undefined, "https://pending.test");
    abort.abort(Error("waiter stopped"));
    values.push(await waiting);
    assert.equal(calls.at(-1)[1], false);
    release();
    values.push(await survivor);
    const before = calls.length;
    values.push(await settle(a(abort.signal)));
    assert.equal(calls.length, before);
    gate = undefined;
    fail = true;
    values.push(
      await settle(a(undefined, "https://failure.test")),
      await settle(a(undefined, "https://failure.test")),
    );
    assert.equal(calls.length, before + 1); // rejection remains cached until generation/origin changes
    fail = false;
    values.push(await direct(), await a(undefined, "https://failure.test"));
    results.push({ calls, values });
  }
  assert.deepEqual(results[1], results[0]);
});

test("Chat API original and restored headers, parsing, retryability, timeout and disposal traces match", async () => {
  for (const mode of [
    "success",
    "custom-reader",
    "http-json",
    "http-text",
    "http-invalid",
    "decode",
    "network",
    "pre-abort",
    "caller-abort",
    "dispose",
    "timeout-network",
    "timeout-http",
    "timeout-read",
  ]) {
    const results = [];
    for (const original of [true, false]) {
      const trace: any[] = [];
      let onTimeout!: () => void;
      let api: any;
      const abort = new AbortController();
      const setTimeout = ((fn: () => void, ms: number) => {
        trace.push(["timer", ms]);
        onTimeout = fn;
        return 42;
      }) as any;
      const clearTimeout = ((id: number) => trace.push(["clear", id])) as any;
      const fetch = async (url: string, init: any) => {
        trace.push([
          "fetch",
          url,
          { ...init, headers: [...init.headers], signal: "signal" },
        ]);
        if (mode === "network") throw Error("sensitive transport error");
        if (mode === "caller-abort") {
          abort.abort(Error("caller stopped"));
          throw Error("transport");
        }
        if (mode === "dispose") {
          api.dispose();
          throw Error("transport");
        }
        if (mode.startsWith("timeout")) onTimeout();
        if (mode === "timeout-network") throw Error("transport");
        const http = mode.startsWith("http") || mode === "timeout-http";
        return new Response(
          mode === "decode" || mode === "http-invalid"
            ? "invalid"
            : JSON.stringify(
                http ? { detail: { retryable: true } } : { ok: 1 },
              ),
          {
            status: http ? 429 : 200,
            headers: {
              "Content-Type":
                mode === "http-text"
                  ? "text/plain"
                  : "application/json; charset=utf-8",
              "Retry-After": "2",
            },
          },
        );
      };
      const Api = original
        ? extensionBindings(["Dn", "el", "Zm", "Yc"], {
            fetch,
            setTimeout,
            clearTimeout,
            Jc: 15000,
            Es: "https://chatgpt.com/backend-api",
          }).Yc
        : createChatApiClass({ fetch: fetch as any, setTimeout, clearTimeout });
      const account = { id: "account", userId: "user", structure: "personal" };
      api = new Api("fixture-token", account);
      account.id = "changed";
      assert.equal(api.account.id, "account");
      assert.ok(Object.isFrozen(api.account));
      if (mode === "pre-abort") abort.abort(Error("already stopped"));
      const result = await settle(
        api.request(
          "/fixture",
          {
            method: "POST",
            body: "fixture",
            headers: {
              Authorization: "overridden",
              "ChatGPT-Account-ID": "overridden",
              "X-Fixture": "yes",
            },
            signal: abort.signal,
          },
          {
            timeoutMs: 12,
            ...(mode === "custom-reader"
              ? {
                  readResponse: async (r: Response) => [
                    r.status,
                    await r.text(),
                  ],
                }
              : {}),
          },
        ),
      );
      api.dispose();
      const after = await settle(api.request("/after"));
      results.push({ result, after, trace });
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});
