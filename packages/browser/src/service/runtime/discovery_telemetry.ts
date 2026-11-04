import { browserTelemetry } from "./browser_telemetry";
/** Original Zle uses low-level bh: deliberately no codex_ prefix or extra ambient gate. */
export function createDiscoveryFailureReporter(
  logEvent = browserTelemetry.logEvent,
) {
  return function reportDiscoveryFailure(
    runtime: any,
    details: any,
    reason: string,
    iabCandidates: number,
  ) {
    logEvent(runtime, "browser_use_backend_discovery_failed", reason, {
      backend: "iab",
      browser_family: "not_applicable",
      browserCount: String(details.browserCount),
      candidatePipeCount: String(details.candidatePipeCount),
      discoveredIabBrowserCount: String(iabCandidates),
      failureCount: String(details.failures.length),
      failures: JSON.stringify(details.failures),
      iabBrowserCount: String(details.iabBrowserCount),
      pipeListingError: details.pipeListingError ?? "none",
      pipeListingPipeCount: String(details.pipeListingPipeCount),
      platform: runtime.platform,
      reason,
      release: "1.0.0",
    });
  };
}
export const reportDiscoveryFailure = createDiscoveryFailureReporter();
