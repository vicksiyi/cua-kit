import { disabledCapabilities, filterCapabilities } from "./capability_filter";
import { browserTelemetry } from "./runtime/browser_telemetry";
/** Current Ea: SIWC requires the ready browser-specific feature client. */
export function effectiveBrowserCapabilities(runtime: any, info: any,
  gate = browserTelemetry.browserFeatureEnabled) {
  const disabled = new Set(disabledCapabilities(runtime, "tab"));
  if (!disabled.has("siwc") && info.capabilities?.tab?.some(({id}: any) => id === "siwc") &&
      !gate(runtime, "browser_use_siwc_enabled", info)) disabled.add("siwc");
  return {
    browser: filterCapabilities(info.capabilities?.browser ?? [], disabledCapabilities(runtime, "browser")),
    tab: filterCapabilities(info.capabilities?.tab ?? [], disabled),
  };
}
