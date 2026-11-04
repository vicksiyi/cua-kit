import UpstreamNetwork from "@statsig/js-client/src/Network";
import type { StatsigOptions } from "@statsig/js-client";
import {
  Endpoint,
  UrlConfiguration,
  type StatsigUser,
} from "@statsig/client-core";
import { ExtensionStatsigNetworkCore } from "./statsig_network_core";
import { createStatsigLiveNetwork } from "./statsig_live_network";

// Pinned public methods match bundled Kc's ordinary evaluation/delta handling.
// Reuse them on the extended core, so every caller (including the data adapter
// and event logger) shares the same transport from construction onward.
const Network =
  (UpstreamNetwork as unknown as { default?: typeof UpstreamNetwork })
    .default ?? UpstreamNetwork;
const ordinary = Network.prototype as unknown as {
  fetchEvaluations: UpstreamNetwork["fetchEvaluations"];
  _fetchEvaluations(...args: unknown[]): Promise<string | null>;
};

export class ExtensionStatsigNetwork extends ExtensionStatsigNetworkCore {
  private readonly _option: StatsigOptions | null;
  private readonly _initializeUrlConfig: UrlConfiguration;

  constructor(
    options: StatsigOptions | null,
    emitter?: ConstructorParameters<typeof UpstreamNetwork>[1],
  ) {
    super(options, emitter);
    this._option = options;
    const config = options?.networkConfig;
    this._initializeUrlConfig = new UrlConfiguration(
      Endpoint._initialize,
      config?.initializeUrl,
      config?.api,
      config?.initializeFallbackUrls,
    );
  }

  fetchEvaluations(...args: Parameters<UpstreamNetwork["fetchEvaluations"]>) {
    return ordinary.fetchEvaluations.apply(this, args);
  }

  _fetchEvaluations(...args: unknown[]) {
    return ordinary._fetchEvaluations.apply(this, args);
  }

  fetchLiveEvaluations(
    sdkKey: string,
    user: StatsigUser,
    sinceTime: number | undefined,
    previousDerivedFields: unknown,
    priority?: "high" | "low",
    fullChecksum?: string | null,
  ) {
    // Read options for each call, preserving changes to the caller-owned object.
    return createStatsigLiveNetwork({
      hashAlgorithm: this._option?.networkConfig?.initializeHashAlgorithm,
      initializeUrlConfig: this._initializeUrlConfig,
      post: (args) => this.post(args as Parameters<this["post"]>[0]),
    })(sdkKey, user, sinceTime, previousDerivedFields, priority, fullChecksum);
  }
}
