import { type StatsigClient, LogLevel } from "@statsig/js-client";
import { ExtensionStatsigClient } from "./statsig_client";
import type { createSiwcServiceClass } from "./siwc";
type AuthReader = ReturnType<
  ReturnType<typeof createSiwcServiceClass>["createCachedAuthReader"]
>;
type Tags = Record<string, string>;
type Update = ReturnType<StatsigClient["initializeAsync"]>;
export type ExtensionFeatureClient = Pick<
  StatsigClient,
  keyof StatsigClient
> & {
  refreshValuesAsync(options?: { timeoutMs?: number }): Update;
};
export type ExtensionFeatureClientConstructor = new (
  sdkKey: string,
  user: ConstructorParameters<typeof StatsigClient>[1],
  options: NonNullable<ConstructorParameters<typeof StatsigClient>[2]> & {
    enableLiveValuesAutoRefresh: boolean;
  },
) => ExtensionFeatureClient;
/** Original Un/Yt/Mr/Is/Qm/As/rl/nl/$n/Cs/eg/tg. Defaults to the restored extended SDK; public 3.33.4 is not a drop-in replacement. */
export function createExtensionFeatureService(host: {
  chrome: Pick<typeof chrome, "runtime" | "storage">;
  crypto: Pick<Crypto, "randomUUID">;
  readAuth: AuthReader;
  buildChannel(): "dev" | "internal" | "prod";
  browserFamily: string;
  sdkKey: string;
  api: string;
  fetch: typeof globalThis.fetch;
  warn(message: string): void;
  Client?: ExtensionFeatureClientConstructor;
}) {
  const Client = host.Client ?? ExtensionStatsigClient;
  let stableId: string | undefined;
  let client: ExtensionFeatureClient | undefined;
  let update: Update | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>) {
    const pending = queue.then(operation);
    queue = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  async function getStableId() {
    if (stableId != null) return stableId;
    const key = "codexToolbarStateTelemetryId";
    const saved = (await host.chrome.storage.local.get([key]))[key];
    if (typeof saved === "string" && saved.length > 0) stableId = saved;
    else {
      const generated = host.crypto.randomUUID();
      await host.chrome.storage.local.set({ [key]: generated });
      stableId = generated;
    }
    return stableId;
  }
  async function readIdentity(reader: AuthReader, signal?: AbortSignal) {
    try {
      const timeout = AbortSignal.timeout(3000);
      const result = await reader(
        signal == null ? timeout : AbortSignal.any([timeout, signal]),
      );
      return "error" in result || result.session == null
        ? undefined
        : {
            userID: result.session.account.userId,
            ...(result.session.email?.trim()
              ? { email: result.session.email }
              : {}),
          };
    } catch {
      return;
    }
  }
  async function ensureClient(reader = host.readAuth, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const [id, identity] = await Promise.all([
      getStableId(),
      readIdentity(reader, signal),
    ]);
    signal?.throwIfAborted();
    const channel = host.buildChannel();
    const user = {
      ...identity,
      appVersion: host.chrome.runtime.getManifest().version,
      custom: { client: "chrome_extension" },
      customIDs: { stableID: id },
    };
    if (client != null) {
      const current = client.getContextHandle().user;
      if (current.userID !== user.userID || current.email !== user.email) {
        if (update == null) {
          if (
            !client.updateUserSync(user, {
              disableBackgroundCacheRefresh: true,
            }).success
          )
            throw Error("Failed to update Chrome extension Statsig identity.");
        } else update = client.updateUserAsync(user, { timeoutMs: 10000 });
      }
      return client;
    }
    const created = new Client(host.sdkKey, user, {
      disableStorage: true,
      enableLiveValuesAutoRefresh: true,
      environment: {
        tier: { dev: "development", internal: "staging", prod: "production" }[
          channel
        ],
      },
      includeCurrentPageUrlWithEvents: false,
      logLevel: LogLevel.None,
      loggingEnabled: "always",
      networkConfig: {
        api: host.api,
        networkOverrideFunc: (url, init) =>
          host.fetch(url, {
            ...init,
            credentials: "omit",
            signal: AbortSignal.timeout(10000),
          }),
        sdkExceptionUrl: `${host.api}/sdk_exception`,
      },
    });
    client = created;
    let flushQueued = false;
    const flushExposure = () => {
      if (flushQueued) return;
      flushQueued = true;
      enqueue(async () => {
        flushQueued = false;
        await created.flush();
      }).catch(() =>
        host.warn("Failed to flush Chrome extension Statsig exposures."),
      );
    };
    created.on("gate_evaluation", flushExposure);
    created.on("dynamic_config_evaluation", flushExposure);
    return created;
  }
  function metadata(tags: Tags) {
    return {
      ...tags,
      build_channel: host.buildChannel(),
      extension_version: host.chrome.runtime.getManifest().version,
      browser_family: host.browserFamily,
    };
  }
  function reportMetric(name: string, value: string | number, tags: Tags) {
    return enqueue(async () => {
      const sdk = await ensureClient();
      const data = metadata(tags);
      let flushed = false;
      const listener: Parameters<StatsigClient["on"]>[1] = (event: any) => {
        flushed ||= event.events.some(
          (item: any) => item.eventName === name && item.metadata === data,
        );
      };
      sdk.on("logs_flushed", listener);
      try {
        sdk.logEvent(name, value, data);
        await sdk.flush();
        if (!flushed) await sdk.flush();
        if (!flushed)
          throw Error("Failed to report Chrome extension Statsig event.");
      } finally {
        sdk.off("logs_flushed", listener);
      }
    });
  }
  function bufferMetric(name: string, value: string | number, tags: Tags) {
    if (client?.loadingStatus === "Ready") {
      try {
        client.logEvent(name, value, metadata(tags));
      } catch {
        host.warn("Failed to buffer Chrome extension Statsig event.");
      }
    }
  }
  async function refreshAuth(reader = host.readAuth, signal?: AbortSignal) {
    const options = { timeoutMs: 10000 };
    const { sdk, previous, ready } = await enqueue(async () => {
      const previous = update;
      const sdk = await ensureClient(reader, signal);
      return {
        sdk,
        previous,
        ready: (update ??= sdk.initializeAsync(options)),
      };
    });
    const result = await ready;
    signal?.throwIfAborted();
    if (previous === ready && update === ready && !result.success)
      update = sdk.refreshValuesAsync(options);
    let observed: Update | undefined;
    do {
      observed = update;
      await observed;
      signal?.throwIfAborted();
    } while (observed !== update);
  }
  function currentGate(name: string) {
    return client?.loadingStatus === "Ready" && client.checkGate(name);
  }
  async function checkGate(name: string) {
    await refreshAuth();
    return currentGate(name);
  }
  async function getDynamicConfig(name: string) {
    await refreshAuth();
    return client?.loadingStatus === "Ready"
      ? client.getDynamicConfig(name)
      : undefined;
  }
  async function subscribeGate(
    name: string,
    listener: (
      enabled: boolean,
      status: string,
      userId: string | undefined,
    ) => void,
    signal?: AbortSignal,
  ) {
    const subscription = await enqueue(async () => {
      const sdk = client ?? (await ensureClient());
      const publish = () => {
        if (!signal?.aborted)
          listener(
            currentGate(name),
            sdk.loadingStatus,
            sdk.getContextHandle().user.userID,
          );
      };
      const stop = () => {
        sdk.off("values_updated", publish);
        signal?.removeEventListener("abort", stop);
      };
      if (!signal?.aborted) {
        sdk.on("values_updated", publish);
        signal?.addEventListener("abort", stop, { once: true });
      }
      return {
        ready: (update ??= sdk.initializeAsync({ timeoutMs: 10000 })),
        publish,
        stop,
      };
    });
    try {
      await subscription.ready;
      let observed: Update | undefined;
      do {
        observed = update;
        await observed;
      } while (observed !== update);
      subscription.publish();
      return subscription.stop;
    } catch (error) {
      subscription.stop();
      throw error;
    }
  }
  return {
    reportMetric,
    bufferMetric,
    refreshAuth,
    checkGate,
    getDynamicConfig,
    subscribeGate,
  };
}
