import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { originalStatsigNetworkCore } from "./extension-statsig-source";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
const {
  NetworkCore,
  UrlConfiguration,
  Endpoint,
  Log,
  LogLevel,
} = require("@statsig/client-core");
Log.level = LogLevel.None;
async function exercise(Core: any, skipInitTracking: boolean, fail: boolean) {
  const trace: string[] = [];
  const core = new Core(
    {
      disableStatsigEncoding: true,
      networkConfig: {
        networkOverrideFunc: async () => {
          trace.push("fetch");
          return new Response(fail ? "failed" : null, {
            status: fail ? 400 : 204,
            headers: { "x-statsig-live-overlay-lcut": "42" },
          });
        },
      },
    },
    () => trace.push("emit-error"),
  );
  core._fallbackResolver = {
    getActiveFallbackUrl: () => undefined,
    tryBumpExpiryTime() {
      trace.push("bump");
    },
    async tryFetchUpdatedFallbackInfo() {
      trace.push("fetch-fallback");
      return false;
    },
  };
  core._errorBoundary = {
    attachErrorIfNoneExists() {
      trace.push("attach-error");
    },
  };
  const response = await core.post({
    sdkKey: "fixture-key",
    urlConfig: new UrlConfiguration(
      Endpoint._initialize,
      "https://fixture.invalid/initialize",
    ),
    data: {},
    skipInitTracking,
  });
  return {
    trace,
    cursor: response?.headers?.get("x-statsig-live-overlay-lcut"),
    initUrl: core.getLastUsedInitUrlAndReset(),
    code: response?.code,
  };
}
test("installed NetworkCore retains headers and excludes live requests from initialization URL tracking", async () => {
  const Original = originalStatsigNetworkCore();
  const bundled = await exercise(Original, true, false);
  const upstream = await exercise(NetworkCore, true, false);
  assert.deepEqual(bundled.trace, upstream.trace);
  assert.equal(bundled.cursor, "42");
  assert.equal(upstream.cursor, undefined);
  assert.equal(bundled.initUrl, null);
  assert.equal(upstream.initUrl, "https://fixture.invalid/initialize");
  assert.equal(bundled.code, 204);
  const ordinary = await exercise(Original, false, false);
  assert.equal(ordinary.initUrl, "https://fixture.invalid/initialize");
});
test("installed NetworkCore suppresses fallback refresh and initialization error propagation only for live requests", async () => {
  const Original = originalStatsigNetworkCore();
  assert.deepEqual((await exercise(Original, true, true)).trace, ["fetch"]);
  assert.deepEqual((await exercise(NetworkCore, true, true)).trace, [
    "fetch",
    "fetch-fallback",
    "emit-error",
    "attach-error",
  ]);
  assert.deepEqual((await exercise(Original, false, true)).trace, [
    "fetch",
    "fetch-fallback",
    "emit-error",
    "attach-error",
  ]);
});
