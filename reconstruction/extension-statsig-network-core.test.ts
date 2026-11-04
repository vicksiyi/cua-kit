import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { originalStatsigNetworkCore } from "./extension-statsig-source";
import { ExtensionStatsigNetworkCore } from "../packages/browser-extension/src/statsig_network_core";
import { createStatsigLiveNetwork } from "../packages/browser-extension/src/statsig_live_network";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
const {
  UrlConfiguration,
  Endpoint,
  Log,
  LogLevel,
} = require("@statsig/client-core");
Log.level = LogLevel.None;
test("restored NetworkCore matches bundled dispatch, headers, diagnostics, errors and retries", async () => {
  const originalNow = Date.now;
  Date.now = () => 1000;
  try {
    for (const mode of [
      "success",
      "failure",
      "reject",
      "retry",
      "timeout",
      "preserve",
      "blocked",
      "invalid",
      "rate-limit",
      "fallback",
    ])
      for (const live of [false, true]) {
        const outputs = [];
        for (const Core of [
          originalStatsigNetworkCore(),
          ExtensionStatsigNetworkCore,
        ]) {
          const trace: any[] = [];
          let requests = 0;
          const core: any = new Core(
            {
              disableStatsigEncoding: true,
              networkConfig: {
                networkTimeoutMs: 5,
                preventAllNetworkTraffic: mode === "blocked",
                networkOverrideFunc: async (url: string, config: any) => {
                  trace.push([
                    "fetch",
                    url,
                    config.method,
                    config.headers,
                    config.keepalive,
                    config.priority,
                  ]);
                  requests++;
                  if (mode === "reject") throw Error("fixture-rejection");
                  if (mode === "timeout") return new Promise(() => {});
                  const failure =
                    ["failure", "preserve", "fallback"].includes(mode) ||
                    (mode === "retry" && requests === 1);
                  return new Response(failure ? "failed" : "ok", {
                    status: failure ? (mode === "retry" ? 503 : 400) : 200,
                    headers: { "x-statsig-live-overlay-lcut": "42" },
                  });
                },
              },
            },
            (event: any) => trace.push(["emit", event.name, event.tag]),
          );
          core._fallbackResolver = {
            getActiveFallbackUrl: () =>
              mode === "fallback" ? "https://fallback.invalid/init" : undefined,
            tryBumpExpiryTime() {
              trace.push("bump");
            },
            async tryFetchUpdatedFallbackInfo() {
              trace.push("fallback");
              return mode === "fallback";
            },
          };
          core._errorBoundary = {
            attachErrorIfNoneExists() {
              trace.push("attach");
            },
          };
          if (mode === "rate-limit")
            core._leakyBucket[Endpoint._initialize] = {
              count: 50,
              lastRequestTime: 1000,
            };
          const failureInfo: any = {};
          const response = await core.post(
            {
              sdkKey: mode === "invalid" ? "" : "network-fixture",
              urlConfig: new UrlConfiguration(
                Endpoint._initialize,
                "https://fixture.invalid/init",
              ),
              data: { responseMode: "live_overlay" },
              retries: mode === "retry" ? 1 : 0,
              preserveFailedStatusCode: mode === "preserve",
              skipInitTracking: live,
              priority: "low",
            },
            failureInfo,
          );
          outputs.push({
            trace,
            failureInfo,
            response:
              response == null
                ? null
                : {
                    code: response.code,
                    body: response.body,
                    cursor: response.headers?.get(
                      "x-statsig-live-overlay-lcut",
                    ),
                  },
            initUrl: core.getLastUsedInitUrlAndReset(),
          });
        }
        assert.deepEqual(outputs[1], outputs[0], `${mode} live=${live}`);
      }
  } finally {
    Date.now = originalNow;
  }
});
test("live-overlay helper uses restored NetworkCore response headers end to end", async () => {
  const core = new ExtensionStatsigNetworkCore({
    disableStatsigEncoding: true,
    networkConfig: {
      networkOverrideFunc: async () =>
        new Response(null, {
          status: 204,
          headers: { "x-statsig-live-overlay-lcut": "123" },
        }),
    },
  });
  const fetchLive = createStatsigLiveNetwork({
    initializeUrlConfig: new UrlConfiguration(
      Endpoint._initialize,
      "https://fixture.invalid/init",
    ),
    post: (args) => core.post(args as any),
  });
  assert.deepEqual(
    await fetchLive("network-fixture", { userID: "u" }, 0, {}, "low"),
    { hasUpdates: false, lcut: 123 },
  );
  assert.equal(core.getLastUsedInitUrlAndReset(), null);
});
