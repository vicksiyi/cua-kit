import { DataAdapterCore } from "@statsig/client-core";
import { StatsigEvaluationsDataAdapter } from "@statsig/js-client/src/StatsigEvaluationsDataAdapter";
import { ExtensionStatsigNetwork } from "./statsig_network";

/** Bundled zm attachment: the class identity must follow the restored network. */
export class ExtensionStatsigDataAdapter extends StatsigEvaluationsDataAdapter {
  attach(...args: Parameters<StatsigEvaluationsDataAdapter["attach"]>) {
    const [sdkKey, options, network] = args;
    DataAdapterCore.prototype.attach.call(this, sdkKey, options, network);
    (this as unknown as { _network: unknown })._network =
      network instanceof ExtensionStatsigNetwork
        ? network
        : new ExtensionStatsigNetwork(options ?? {});
  }
}
