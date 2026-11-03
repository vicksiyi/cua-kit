import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { originalServiceBindings } from "./service-source.ts";
import {
  fetchAssetContent,
  fetchAssetInPage,
  resourceContentType,
} from "../packages/browser/dist/service/context/asset_fetch.js";
const original = originalServiceBindings([
  "oL",
  "Coe",
  "eL",
  "Aoe",
  "Eoe",
  "Toe",
]);
test("asset loaded content and fallback preserve authorization boundaries and error identity", async () => {
  async function run(fn: any, mode: string) {
    const trace: any[] = [],
      denied = new Error("denied"),
      failed = new Error("page failed");
    const cdp = {
      async call(_tab: number, method: string, params: any) {
        trace.push([method, params]);
        if (method === "Page.getFrameTree") {
          if (mode === "frameFailure") throw denied;
          return mode === "missing"
            ? {}
            : { frameTree: { frame: { id: "f" } } };
        }
        if (method === "Page.getResourceContent") {
          if (!["loaded", "base64"].includes(mode))
            throw Error("resource failed");
          return {
            content: mode === "base64" ? "AAE=" : "中文😀",
            base64Encoded: mode === "base64",
          };
        }
        if (method === "Page.getResourceTree")
          return {
            frameTree: {
              childFrames: [
                {
                  resources: [
                    { url: "https://example.com/a", mimeType: "image/png" },
                  ],
                },
              ],
            },
          };
      },
      async evaluateJavascript(_tab: number, expression: string, options: any) {
        trace.push(["evaluate", options]);
        if (mode === "pageFailure") throw failed;
        if (mode === "null") return null;
        // Execute the serialized page function, not a canned content result.
        return await vm.runInNewContext(expression, {
          fetch: async () => ({
            ok: true,
            arrayBuffer: async () => new Uint8Array([0, 255]).buffer,
            headers: { get: () => "image/png" },
          }),
          Uint8Array,
          btoa,
        });
      },
    };
    try {
      const result = await fn({
        cdp,
        tabId: 1,
        url: "https://example.com/a",
        ensureFallbackFetchAllowed: async (url: string) => {
          trace.push(["authorize", url]);
          if (mode === "deny") throw denied;
        },
      });
      return { trace, result: structuredClone(result) };
    } catch (error: any) {
      return {
        trace,
        message: error.message,
        isDenied: error === denied,
        causeIsFailed: error.cause === failed,
      };
    }
  }
  for (const mode of [
    "loaded",
    "base64",
    "missing",
    "fallback",
    "frameFailure",
    "deny",
    "pageFailure",
    "null",
  ])
    assert.deepEqual(
      await run(fetchAssetContent, mode),
      await run(original.Toe, mode),
    );
});
test("asset page fetch handles chunk boundaries, HTTP errors and resource tree precedence", async () => {
  const bytes = Uint8Array.from({ length: 65539 }, (_, i) => i % 256);
  async function run(fn: any, ok: boolean) {
    const trace: any[] = [];
    try {
      const value = await vm.runInNewContext(
        `(${fn.toString()})({url:'https://example.com/a'})`,
        {
          fetch: async (url: string, options: any) => {
            trace.push([url, options]);
            return {
              ok,
              status: 403,
              arrayBuffer: async () => bytes.buffer,
              headers: { get: () => null },
            };
          },
          Uint8Array,
          btoa,
        },
      );
      return JSON.parse(JSON.stringify({ trace, value }));
    } catch (error: any) {
      return JSON.parse(JSON.stringify({ trace, error: error.message }));
    }
  }
  for (const ok of [true, false])
    assert.deepEqual(
      await run(fetchAssetInPage, ok),
      await run(original.Eoe, ok),
    );
  for (const tree of [
    null,
    {},
    {
      resources: [{ url: "a", mimeType: "" }],
      childFrames: [{ resources: [{ url: "a", mimeType: "child" }] }],
    },
    { childFrames: [{ resources: [{ url: "a", mimeType: "child" }] }] },
  ])
    assert.equal(resourceContentType(tree, "a"), original.oL(tree, "a"));
});
