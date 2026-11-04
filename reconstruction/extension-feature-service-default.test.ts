import assert from "node:assert/strict";
import test from "node:test";
import { createExtensionFeatureService } from "../packages/browser-extension/src/feature_service";
import { ExtensionStatsigClient } from "../packages/browser-extension/src/statsig_client";
import { ExtensionStatsigNetwork } from "../packages/browser-extension/src/statsig_network";

test("default feature service uses restored SDK for identity, evaluations, subscriptions and metrics", async () => {
  const clients: ExtensionStatsigClient[] = [];
  const original = ExtensionStatsigClient.prototype.initializeAsync;
  ExtensionStatsigClient.prototype.initializeAsync = function (...args) {
    if (!clients.includes(this)) clients.push(this);
    return original.apply(this, args);
  };
  const requests: { path: string; credentials: unknown }[] = [];
  const saved: Record<string, unknown> = {};
  let userID = "first";
  const warnings: string[] = [];
  const api = createExtensionFeatureService({
    chrome: {
      runtime: { getManifest: () => ({ version: "1.2.3" }) },
      storage: {
        local: {
          get: async () => saved,
          set: async (values: any) => Object.assign(saved, values),
        },
      },
    } as any,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    readAuth: (async () => ({
      session: {
        account: { userId: userID },
        email: "fixture@example.invalid",
      },
    })) as any,
    buildChannel: () => "prod",
    browserFamily: "chromium",
    sdkKey: "client-default-fixture",
    api: "https://fixture.invalid",
    warn: (message) => warnings.push(message),
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push({ path, credentials: init?.credentials });
      assert.ok(init?.signal);
      if (path.endsWith("/initialize"))
        return new Response(
          JSON.stringify({
            has_updates: true,
            time: Date.now(),
            hash_used: "none",
            feature_gates: {
              enabled: {
                name: "enabled",
                value: userID === "first",
                rule_id: "rule",
                secondary_exposures: [],
              },
            },
            dynamic_configs: {
              config: {
                name: "config",
                value: { count: 7 },
                rule_id: "rule",
                secondary_exposures: [],
              },
            },
            layer_configs: {},
            param_stores: {},
          }),
          { status: 200 },
        );
      assert.equal(path, "/rgstr");
      return new Response('{"success":true}', { status: 200 });
    },
  });
  let stop: (() => void) | undefined;
  try {
    assert.equal(await api.checkGate("enabled"), true);
    assert.equal(clients.length, 1);
    const client: any = clients[0];
    assert.ok(client._network instanceof ExtensionStatsigNetwork);
    assert.equal(client.dataAdapter._network, client._network);
    assert.equal((await api.getDynamicConfig("config"))?.get("count", 0), 7);
    const published: unknown[] = [];
    stop = await api.subscribeGate("enabled", (...args) =>
      published.push(args),
    );
    assert.deepEqual(published.at(-1), [true, "Ready", "first"]);
    userID = "second";
    await api.refreshAuth();
    assert.equal(await api.checkGate("enabled"), false);
    assert.deepEqual(published.at(-1), [false, "Ready", "second"]);
    api.bufferMetric("buffered", 1, {});
    await api.reportMetric("explicit", 2, { source: "test" });
    assert.equal(
      saved.codexToolbarStateTelemetryId,
      "00000000-0000-4000-8000-000000000001",
    );
    assert.ok(requests.some((request) => request.path === "/rgstr"));
    assert.ok(requests.every((request) => request.credentials === "omit"));
    assert.deepEqual(warnings, []);
  } finally {
    stop?.();
    ExtensionStatsigClient.prototype.initializeAsync = original;
    await Promise.all(clients.map((client) => client.shutdown()));
  }
});
