import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { ExtensionStatsigDiagnostics } from "../packages/browser-extension/src/statsig_diagnostics";
import { ExtensionStatsigNetwork } from "../packages/browser-extension/src/statsig_network";

function original() {
  return extensionBindings(["vs"], {
    L: (factory: Function) => () => {
      const exports = {};
      factory(exports);
      return exports;
    },
  }).vs().Diagnostics;
}

test("Statsig diagnostics facade matches bundled sync metadata, errors and marker lifecycle", () => {
  const previousNow = Date.now;
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  try {
    for (const syncType of [
      undefined,
      "initialize",
      "update_user",
      "refresh_values",
    ]) {
      for (const online of [undefined, true, false, "unknown"]) {
        Object.defineProperty(globalThis, "navigator", {
          configurable: true,
          value: { onLine: online },
        });
        const traces = [];
        for (const diagnostics of [original(), ExtensionStatsigDiagnostics]) {
          let tick = 100;
          Date.now = () => tick++;
          const key = "diagnostics-fixture";
          diagnostics._clearMarkers(key);
          const events: any[] = [];
          const logger = { enqueue: (event: any) => events.push(event) };
          const empty = diagnostics._enqueueDiagnosticsEvent(
            null,
            logger,
            key,
            null,
            syncType,
          );
          diagnostics._markInitOverallStart(key, syncType);
          diagnostics._markInitNetworkReqStart(key, { attempt: 1 });
          const data = diagnostics._getDiagnosticsData(
            new Response("", {
              status: 200,
              headers: { "x-statsig-region": "test" },
            }),
            1,
            '{"is_delta":true}',
            Object.assign(new Error("failure"), { code: 42 }),
          );
          diagnostics._markInitNetworkReqEnd(key, data);
          diagnostics._markInitProcessStart(key, syncType);
          diagnostics._markInitProcessEnd(
            key,
            { success: false, syncType: "ignored" },
            syncType,
          );
          diagnostics._markInitOverallEnd(
            key,
            false,
            { reason: "Network", source: "Network" },
            syncType,
          );
          const markerArray = diagnostics._getMarkers(key);
          const elapsed = diagnostics._enqueueDiagnosticsEvent(
            { userID: "u" },
            logger,
            key,
            { disableStorage: true },
            syncType,
          );
          assert.notEqual(events[0].metadata.markers, markerArray);
          diagnostics._markInitOverallStart("other", syncType);
          assert.throws(
            () =>
              diagnostics._enqueueDiagnosticsEvent(
                null,
                {
                  enqueue() {
                    throw new Error("logger");
                  },
                },
                "other",
                null,
                syncType,
              ),
            /logger/,
          );
          traces.push({
            empty,
            data,
            elapsed,
            events,
            cleared: diagnostics._getMarkers(key),
            clearedOnFailure: diagnostics._getMarkers("other"),
            error: diagnostics._formatError("string"),
          });
        }
        assert.deepEqual(traces[1], traces[0], `${syncType}/${online}`);
      }
    }
  } finally {
    Date.now = previousNow;
    if (previousNavigator)
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    ExtensionStatsigDiagnostics._clearMarkers("diagnostics-fixture");
    ExtensionStatsigDiagnostics._clearMarkers("other");
  }
});

test("extended network contributes connectivity diagnostics while live refresh skips init tracking", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const key = "client-diagnostics-fixture";
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: false },
    });
    ExtensionStatsigDiagnostics._clearMarkers(key);
    const network = new ExtensionStatsigNetwork({
      networkConfig: {
        api: "https://fixture.invalid",
        networkOverrideFunc: async () =>
          new Response('{"has_updates":false}', { status: 200 }),
      },
    });
    ExtensionStatsigDiagnostics._markInitOverallStart(key, "initialize");
    await network.fetchEvaluations(key, null);
    const markers = ExtensionStatsigDiagnostics._getMarkers(key)!;
    assert.equal(markers.length, 3);
    assert.equal((markers[2] as any).hasInternet, false);
    await network.fetchLiveEvaluations(key, {}, 0, {});
    assert.equal(markers.length, 3);
    ExtensionStatsigDiagnostics._markInitOverallEnd(
      key,
      true,
      undefined,
      "initialize",
    );
    const events: any[] = [];
    ExtensionStatsigDiagnostics._enqueueDiagnosticsEvent(
      null,
      { enqueue: (event: any) => events.push(event) } as any,
      key,
      null,
      "initialize",
    );
    assert.equal(events[0].metadata.syncType, "initialize");
    assert.equal(events[0].metadata.markers.length, 4);
  } finally {
    ExtensionStatsigDiagnostics._clearMarkers(key);
    if (previousNavigator)
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
