import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { ExtensionStatsigNetwork } from "../packages/browser-extension/src/statsig_network";
import { originalStatsigNetwork } from "./extension-statsig-source";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
const core = require("@statsig/client-core");

test("assembled Statsig network matches bundled ordinary/delta and live requests on one instance", async () => {
  const Original = originalStatsigNetwork();
  const cached = {
    has_updates: true,
    hash_used: "djb2",
    time: 4,
    full_checksum: "base",
    derived_fields: { country: "GB" },
    feature_gates: { old: { value: false } },
    dynamic_configs: {},
    layer_configs: {},
  };
  const delta: any = {
    is_delta: true,
    checksum: "unused",
    time: 5,
    feature_gates: { added: { value: true } },
    dynamic_configs: {},
    layer_configs: {},
    deleted_gates: ["old"],
  };
  delta.checksumV2 = core._DJB2Object(
    {
      feature_gates: delta.feature_gates,
      dynamic_configs: {},
      layer_configs: {},
    },
    2,
  );
  for (const mode of [
    "empty",
    "cache",
    "invalid-cache",
    "wrong-hash",
    "invalid-204-cache",
    "204",
    "failed",
    "null",
    "delta",
    "bad-delta",
    "mutated-options",
  ]) {
    const traces = [];
    for (const Class of [Original, ExtensionStatsigNetwork]) {
      const options: any = {
        networkConfig: {
          api: "https://fixture.invalid",
          initializeHashAlgorithm: "djb2",
        },
      };
      const network = new Class(options);
      const calls: any[] = [];
      network.post = async (args: any) => {
        calls.push({ ...args, urlConfig: args.urlConfig.getUrl() });
        if (args.skipInitTracking)
          return {
            code: 204,
            headers: new Headers({ "x-statsig-live-overlay-lcut": "9" }),
          };
        if (mode === "204") return { code: 204 };
        if (mode === "failed") return { code: 500, body: "failure" };
        if (mode === "null") return null;
        if (mode === "delta") return { code: 200, body: JSON.stringify(delta) };
        if (mode === "bad-delta" && calls.length === 1)
          return {
            code: 200,
            body: JSON.stringify({ ...delta, checksumV2: "invalid" }),
          };
        return { code: 200, body: '{"has_updates":true}' };
      };
      const cache =
        mode === "empty"
          ? null
          : mode === "invalid-cache"
            ? "{}"
            : JSON.stringify({
                ...cached,
                hash_used: mode === "wrong-hash" ? "none" : "djb2",
              });
      const ordinary = await network.fetchEvaluations(
        "client-fixture",
        cache,
        "high",
        { userID: "u" },
        mode !== "invalid-204-cache",
      );
      if (mode === "mutated-options")
        options.networkConfig.initializeHashAlgorithm = "none";
      const live = await network.fetchLiveEvaluations(
        "client-fixture",
        { userID: "u" },
        4,
        {},
        "low",
        "base",
      );
      traces.push({ calls, ordinary, live });
    }
    assert.deepEqual(traces[1], traces[0], mode);
    if (mode === "bad-delta") assert.equal(traces[1].calls.length, 3);
    if (mode === "delta")
      assert.deepEqual(
        JSON.parse(traces[1].ordinary).feature_gates,
        delta.feature_gates,
      );
  }
});

test("assembled network routes ordinary and live calls through extended core without external HTTP", async () => {
  const requests: string[] = [];
  const network = new ExtensionStatsigNetwork({
    networkConfig: {
      api: "https://fixture.invalid",
      networkOverrideFunc: async (url: any) => {
        requests.push(String(url));
        return requests.length === 1
          ? new Response('{"has_updates":false}', { status: 200 })
          : new Response(null, {
              status: 204,
              headers: { "x-statsig-live-overlay-lcut": "17" },
            });
      },
    },
  });
  assert.equal(
    await network.fetchEvaluations("client-fixture", null),
    '{"has_updates":false}',
  );
  assert.deepEqual(
    await network.fetchLiveEvaluations("client-fixture", {}, 0, {}),
    { hasUpdates: false, lcut: 17 },
  );
  assert.equal(requests.length, 2);
  assert.ok(
    requests.every((url) => url.startsWith("https://fixture.invalid/")),
  );
});
