import { environmentString } from "../capability_filter";
import { browserTelemetry } from "../runtime/browser_telemetry";
import type { WebMcpDirectoryDependencies } from "./tool_directory";
/** Original Bh bindings: Ar is the ambient-network opt-out, gh is the initialized
 * client gate reader (not Gee's caller-identity wrapper), $M config and dt events. */
export const defaultWebMcpDependencies: Omit<
  WebMcpDirectoryDependencies,
  "assertSupported"
> = {
  ambientNetworkDisabled: (runtime) =>
    environmentString(runtime as any, "BROWSER_USE_DISABLE_AMBIENT_NETWORK") ===
    "1",
  featureFlag: browserTelemetry.readFeatureGate,
  config: browserTelemetry.dynamicConfig,
  emit: browserTelemetry.emitEvent,
};
