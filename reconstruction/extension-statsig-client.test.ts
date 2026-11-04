import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { ExtensionStatsigClient } from "../packages/browser-extension/src/statsig_client";
import { ExtensionStatsigNetwork } from "../packages/browser-extension/src/statsig_network";
import { ExtensionStatsigDataAdapter } from "../packages/browser-extension/src/statsig_data_adapter";
import { originalAssembledStatsigClient } from "./extension-statsig-source";
const require = createRequire(
  new URL("../packages/browser-extension/package.json", import.meta.url),
);
const core = require("@statsig/client-core");

function values(value: boolean) {
  return {
    has_updates: true,
    time: Date.now(),
    hash_used: "none",
    feature_gates: {
      example: {
        name: "example",
        value,
        rule_id: "rule",
        secondary_exposures: [],
      },
    },
    dynamic_configs: {},
    layer_configs: {},
    param_stores: {},
  };
}

test("constructed Statsig client matches bundled initialize/update/refresh/evaluate lifecycle", async () => {
  const Original = originalAssembledStatsigClient();
  const results = [];
  for (const Class of [Original, ExtensionStatsigClient]) {
    let requests = 0;
    const events: string[] = [];
    let pluginBound = false;
    const key = "client-assembled-fixture";
    const client: any = new Class(
      key,
      { userID: "first" },
      {
        disableStorage: true,
        loggingEnabled: "disabled",
        logLevel: 0,
        networkConfig: {
          api: "https://fixture.invalid",
          initializeHashAlgorithm: "none",
          networkOverrideFunc: async () => {
            requests++;
            return new Response(JSON.stringify(values(requests % 2 === 1)), {
              status: 200,
            });
          },
        },
        plugins: [
          {
            bind(instance: any) {
              pluginBound = true;
              assert.equal(instance.dataAdapter._network, instance._network);
              assert.equal(instance._logger._network, instance._network);
              assert.equal(instance.getContext().user.userID, "first");
              assert.equal(typeof instance.refreshValuesAsync, "function");
              instance.on("values_updated", () =>
                events.push(instance.loadingStatus),
              );
            },
          },
        ],
      },
    );
    try {
      assert.ok(pluginBound);
      const initialized = await client.initializeAsync();
      const first = client.checkGate("example");
      const updated = await client.updateUserAsync({ userID: "second" });
      const second = client.checkGate("example");
      const user = client._user;
      const refreshed = await client.refreshValuesAsync();
      assert.equal(client._user, user);
      const third = client.checkGate("example");
      results.push({
        success: [initialized.success, updated.success, refreshed.success],
        gates: [first, second, third],
        events,
        requests,
        status: client.loadingStatus,
        user: client.getContext().user.userID,
        configs: client.getConfigList(),
      });
      assert.equal(client.getContextHandle(), client._contextHandle);
    } finally {
      await client.shutdown();
    }
  }
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[1].gates, [true, false, true]);
  assert.deepEqual(results[1].success, [true, true, true]);
});

test("restored adapter retains extended network and shutdown clears live timer", async () => {
  const network = new ExtensionStatsigNetwork(null);
  const adapter: any = new ExtensionStatsigDataAdapter();
  adapter.attach("client-adapter", null, network);
  assert.equal(adapter._network, network);
  adapter.attach("client-adapter", null, null);
  assert.ok(adapter._network instanceof ExtensionStatsigNetwork);
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  const timers = new Map<any, number>();
  globalThis.setInterval = ((_fn: any, delay: number) => {
    const handle = {};
    timers.set(handle, delay);
    return handle;
  }) as any;
  globalThis.clearInterval = ((handle: any) => {
    timers.delete(handle);
  }) as any;
  const client: any = new ExtensionStatsigClient(
    "client-live-fixture",
    { userID: "u" },
    {
      disableStorage: true,
      loggingEnabled: "disabled",
      enableLiveValuesAutoRefresh: true,
      networkConfig: { preventAllNetworkTraffic: true },
    },
  );
  try {
    client.initializeSync({ disableBackgroundCacheRefresh: true });
    assert.ok([...timers.values()].includes(600000));
    await client.shutdown();
    assert.equal(timers.size, 0);
  } finally {
    await client.shutdown();
    globalThis.setInterval = originalSet;
    globalThis.clearInterval = originalClear;
    core.Storage._setDisabled(false);
  }
});
