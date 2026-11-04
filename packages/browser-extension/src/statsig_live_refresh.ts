import { _getStatsigGlobal, _isServerEnv, Log } from "@statsig/client-core";
import type { ExtensionStatsigEvaluationStore } from "./statsig_live_store";
import type { createStatsigLiveNetwork } from "./statsig_live_network";
export interface StatsigLiveRefreshClient {
  _sdkKey: string;
  _user: any;
  loadingStatus: string;
  _store: Pick<
    ExtensionStatsigEvaluationStore,
    "getValues" | "getLiveCursor" | "advanceLiveCursor" | "setLiveValues"
  >;
  _network: {
    fetchLiveEvaluations: ReturnType<typeof createStatsigLiveNetwork>;
  };
  _setStatus(status: string, values: null): void;
}
/** Original Vm live-refresh methods. Construct once per client, preserving its interval/inflight lifetime. */
export function createStatsigLiveRefresh(
  client: StatsigLiveRefreshClient,
  enabled: boolean,
  host: {
    isClient(value: unknown): value is StatsigLiveRefreshClient;
    globalInstances?: () => Record<string, unknown> | undefined;
    isServer?: () => boolean;
    setInterval?: typeof globalThis.setInterval;
    clearInterval?: typeof globalThis.clearInterval;
    now?: () => number;
    error?: (message: string, error: unknown) => void;
  },
) {
  const globalInstances =
    host.globalInstances ?? (() => _getStatsigGlobal().instances);
  const isServer = host.isServer ?? _isServerEnv;
  const startInterval = host.setInterval ?? globalThis.setInterval;
  const clearInterval = host.clearInterval ?? globalThis.clearInterval;
  const now = host.now ?? Date.now;
  const reportError = host.error ?? Log.error;
  let timer: ReturnType<typeof setInterval> | null = null;
  async function refresh() {
    const user = client._user;
    const values = client._store.getValues();
    const cursor = client._store.getLiveCursor();
    const result = await client._network.fetchLiveEvaluations(
      client._sdkKey,
      user,
      cursor.sinceTime,
      cursor.previousDerivedFields,
      "low",
      cursor.fullChecksum,
    );
    if (
      user !== client._user ||
      values !== client._store.getValues() ||
      client.loadingStatus !== "Ready" ||
      result == null
    )
      return;
    if (result.hasUpdates !== true) {
      if (result.lcut != null) client._store.advanceLiveCursor(result.lcut);
      return;
    }
    if (client._store.setLiveValues(result.values, now()))
      client._setStatus("Ready", null);
  }
  function intervalMs() {
    if (!enabled) return;
    const values = client._store.getValues();
    const interval =
      values?.sdk_configs?.live_values_auto_refresh_interval_seconds;
    return typeof interval !== "number" ||
      !Number.isFinite(interval) ||
      interval <= 0
      ? 600000
      : interval * 1000;
  }
  function stop() {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  }
  function start() {
    const delay = intervalMs();
    if (
      delay == null ||
      client.loadingStatus === "Uninitialized" ||
      timer != null
    )
      return;
    let inFlight = false;
    timer = startInterval(() => {
      const current = globalInstances()?.[client._sdkKey];
      if (
        !isServer() &&
        host.isClient(current) &&
        current !== client &&
        current.loadingStatus === "Ready"
      ) {
        stop();
        return;
      }
      if (client.loadingStatus !== "Ready" || inFlight) return;
      inFlight = true;
      refresh()
        .catch((error) =>
          reportError("An error occurred during live values refresh.", error),
        )
        .finally(() => {
          inFlight = false;
        });
    }, delay);
  }
  return { refresh, intervalMs, start, stop };
}
