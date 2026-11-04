import { StatsigClient, type StatsigOptions } from "@statsig/js-client";
import { ExtensionStatsigDataAdapter } from "./statsig_data_adapter";
import {
  StatsigClientBase,
  SDKType,
  MemoPrefix,
  getUUID,
  PrecomputedEvaluationsContextHandle,
  _getStatsigGlobal,
  _isServerEnv,
  Log,
  type StatsigUser,
} from "@statsig/client-core";
import { ExtensionStatsigNetwork } from "./statsig_network";
import { ExtensionStatsigEvaluationStore } from "./statsig_live_store";
import { createStatsigLiveRefresh } from "./statsig_live_refresh";
import { statsigClientLifecycle } from "./statsig_client_lifecycle";

export type ExtensionStatsigOptions = StatsigOptions & {
  enableLiveValuesAutoRefresh?: boolean;
};
// Public SDK declarations hide members needed by its own reused prototype methods.
const ClientBase = StatsigClientBase as unknown as new (
  ...args: any[]
) => Record<string, any>;
export interface ExtensionStatsigClient extends Pick<
  StatsigClient,
  keyof StatsigClient
> {
  refreshValuesAsync: typeof StatsigClient.prototype.initializeAsync;
}
/** Bundled Vm construction with restored deltas and pinned SDK ordinary methods. */
export class ExtensionStatsigClient extends ClientBase {
  static instance(sdkKey?: string): ExtensionStatsigClient {
    const instance = _getStatsigGlobal().instance(sdkKey);
    if (instance instanceof ExtensionStatsigClient) return instance;
    Log.warn(
      _isServerEnv()
        ? "StatsigClient.instance is not supported in server environments"
        : "Unable to find StatsigClient instance",
    );
    return new ExtensionStatsigClient(sdkKey ?? "", {});
  }

  constructor(
    sdkKey: string,
    user: StatsigUser,
    options: ExtensionStatsigOptions | null = null,
  ) {
    SDKType._setClientType(sdkKey, "javascript-client");
    const network = new ExtensionStatsigNetwork(options, (event) =>
      this.$emt(event),
    );
    super(
      sdkKey,
      options?.dataAdapter ?? new ExtensionStatsigDataAdapter(),
      network,
      options,
    );
    this._possibleFirstTouchMetadata = {};
    for (const [name, prefix] of [
      ["FeatureGate", MemoPrefix._gate],
      ["DynamicConfig", MemoPrefix._dynamicConfig],
      ["Experiment", MemoPrefix._experiment],
      ["ConfigList", MemoPrefix._configList],
      ["Layer", MemoPrefix._layer],
      ["ParameterStore", MemoPrefix._paramStore],
    ] as const) {
      (this as Record<string, unknown>)[`get${name}`] = this._memoize(
        prefix,
        this[`_get${name}Impl`].bind(this),
      );
    }
    this._store = new ExtensionStatsigEvaluationStore(
      sdkKey,
      options,
      options?.enableLiveValuesAutoRefresh === true,
    );
    this._network = network;
    this._user = this._configureUser(user, options);
    this._sdkInstanceID = getUUID();
    this._contextHandle = new PrecomputedEvaluationsContextHandle(
      sdkKey,
      () => this._options,
      () => this._errorBoundary,
      () => this._store.getValues(),
      () => this._user,
      () => this._sdkInstanceID,
    );
    this._liveRefresh = createStatsigLiveRefresh(
      this as any,
      options?.enableLiveValuesAutoRefresh === true,
      {
        isClient: (value): value is any =>
          value instanceof ExtensionStatsigClient,
      },
    );
    for (const plugin of options?.plugins ?? [])
      plugin.bind(this as unknown as StatsigClient);
  }

  _refreshLiveValuesAsyncImpl() {
    return this._liveRefresh.refresh();
  }
  _startLiveValuesAutoRefresh() {
    this._liveRefresh.start();
  }
  _stopLiveValuesAutoRefresh() {
    this._liveRefresh.stop();
  }
  _getLiveValuesAutoRefreshIntervalMs() {
    return this._liveRefresh.intervalMs();
  }
  async shutdown() {
    this._stopLiveValuesAutoRefresh();
    await StatsigClientBase.prototype.shutdown.call(this as any);
  }
}

// Preserve class descriptors and dynamic this calls without changing the SDK.
// Exclude construction/lifecycle methods whose bundled implementation differs.
for (const [name, descriptor] of Object.entries(
  Object.getOwnPropertyDescriptors(StatsigClient.prototype),
)) {
  if (
    name === "constructor" ||
    name in statsigClientLifecycle ||
    Object.hasOwn(ExtensionStatsigClient.prototype, name)
  )
    continue;
  Object.defineProperty(ExtensionStatsigClient.prototype, name, descriptor);
}
for (const [name, value] of Object.entries(statsigClientLifecycle)) {
  Object.defineProperty(ExtensionStatsigClient.prototype, name, {
    value,
    writable: true,
    configurable: true,
  });
}
