import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createKernelFetchController,
  encodeKernelBytes,
} from "../packages/browser-extension/src/kernel_fetch";

function original(scope: any, fetch: any) {
  return extensionBindings(["Ds", "dm", "ol", "pg", "wl"], {
    bl: new URL("https://chatgpt.com/aura/site_status"),
    Le: scope,
    fetch,
  });
}

test("kernel control fetch matches original routing, binary response and cancellation", async () => {
  for (const mode of [
    "site",
    "generic",
    "credentials",
    "wrong-path",
    "invalid-url",
    "bad-body",
    "null-body",
    "no-scope",
    "caller-abort",
    "scope-dispose",
    "abort-fetch",
    "dispose",
    "reject",
    "empty-response",
  ]) {
    const results = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const caller = new AbortController(),
        disposal = new AbortController();
      const url =
        mode === "generic"
          ? "https://fixture.invalid/path"
          : mode === "credentials"
            ? "https://u:p@chatgpt.com/aura/site_status"
            : mode === "wrong-path"
              ? "https://chatgpt.com/aura/site_status/"
              : mode === "invalid-url"
                ? "invalid"
                : "https://chatgpt.com/aura/site_status?x=1#fragment";
      let sentSignal!: AbortSignal;
      let release!: () => void;
      const response = async (route: string, target: string, init: any) => {
        sentSignal = init.signal;
        trace.push([
          route,
          target,
          init.method,
          init.body == null ? null : [...init.body],
          init.headers,
          init.signal.aborted,
        ]);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        if (init.signal.aborted) throw init.signal.reason;
        if (mode === "reject") throw Error("request failed");
        return mode === "empty-response"
          ? new Response(null, { status: 204 })
          : new Response(new Uint8Array([0, 255, 1]), {
              status: 201,
              statusText: "Created",
              headers: { "x-fixture": "yes" },
            });
      };
      const plainFetch: any = (url: string, init: any) =>
        response("fetch", url, init);
      const getScope = (id: string) => {
        trace.push(["scope", id]);
        if (mode === "no-scope") throw Error("not executing");
        return {
          signal: caller.signal,
          disposalSignal: disposal.signal,
          chatApi: {
            request: async (path: string, init: any, options: any) =>
              options.readResponse(await response("chat", path, init)),
          },
        };
      };
      const source = original(getScope, plainFetch);
      const controller = restored
        ? createKernelFetchController("scope", {
            siteStatusUrl: new URL("https://chatgpt.com/aura/site_status"),
            getScope,
            fetch: plainFetch,
          })
        : new source.Ds("scope");
      const pending = controller
        .fetch({
          id: "request",
          url,
          init: {
            method: "POST",
            body:
              mode === "bad-body" ? "!" : mode === "null-body" ? null : "AP8B",
            headers: { test: "1" },
          },
        })
        .then(
          (value: any) => ({ value }),
          (error: any) => ({ error: error.name, message: error.message }),
        );
      if (release) {
        if (mode === "caller-abort") caller.abort(new Error("caller"));
        if (mode === "scope-dispose") disposal.abort(new Error("disposed"));
        if (mode === "abort-fetch") controller.abortFetch("request");
        if (mode === "dispose") {
          if (restored) controller.dispose();
          else source.Ds.dispose(controller);
        }
        trace.push(["aborted", sentSignal.aborted]);
        release();
      }
      results.push({
        trace,
        result: await pending,
        active: controller.fetches.size,
      });
    }
    assert.deepEqual(results[1], results[0], mode);
  }
});

test("kernel fetch retains duplicate-id cleanup race and exact byte-view encoding", async () => {
  const outputs = [];
  for (const restored of [false, true]) {
    const releases: (() => void)[] = [],
      signals: AbortSignal[] = [];
    const fetch: any = async (_url: string, init: any) => {
      signals.push(init.signal);
      await new Promise<void>((resolve) => releases.push(resolve));
      return new Response("ok");
    };
    const source = original(() => {
      throw Error("unused");
    }, fetch);
    const controller = restored
      ? createKernelFetchController("scope", {
          siteStatusUrl: new URL("https://chatgpt.com/aura/site_status"),
          getScope: () => {
            throw Error("unused");
          },
          fetch,
        })
      : new source.Ds("scope");
    const args = { id: "same", url: "https://fixture.invalid", init: {} };
    const first = controller.fetch(args),
      second = controller.fetch(args);
    releases[0]();
    await first;
    controller.abortFetch("same");
    outputs.push({
      count: controller.fetches.size,
      aborted: signals.map((signal) => signal.aborted),
    });
    releases[1]();
    await second;
    const bytes = new Uint8Array(70000);
    bytes[2] = 255;
    bytes[65536] = 128;
    const view = bytes.subarray(2, 69999);
    assert.equal(encodeKernelBytes(view), source.pg(view));
  }
  assert.deepEqual(outputs[1], outputs[0]);
  assert.deepEqual(outputs[1], { count: 0, aborted: [false, false] });
});
