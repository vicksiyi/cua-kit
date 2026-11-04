import { Diagnostics } from "@statsig/client-core";
import type { Marker } from "@statsig/client-core/src/Diagnostics";

export type StatsigSyncType = "initialize" | "update_user" | "refresh_values";
type SyncMarker = Marker & { syncType?: StatsigSyncType };

// Share the pinned SDK's marker store so reused SDK/network code contributes to
// the same event. Extend the facade only; never patch the upstream singleton.
function tagLastMarker(sdkKey: string, syncType?: StatsigSyncType) {
  const markers = Diagnostics._getMarkers(sdkKey) as SyncMarker[] | undefined;
  const marker = markers?.[markers.length - 1];
  if (marker) marker.syncType = syncType;
}

export const ExtensionStatsigDiagnostics = {
  ...Diagnostics,
  _markInitOverallStart(sdkKey: string, syncType?: StatsigSyncType) {
    Diagnostics._markInitOverallStart(sdkKey);
    tagLastMarker(sdkKey, syncType);
  },
  _markInitOverallEnd(
    sdkKey: string,
    success: boolean,
    details?: Parameters<typeof Diagnostics._markInitOverallEnd>[2],
    syncType?: StatsigSyncType,
  ) {
    Diagnostics._markInitOverallEnd(sdkKey, success, details);
    tagLastMarker(sdkKey, syncType);
  },
  _markInitProcessStart(sdkKey: string, syncType?: StatsigSyncType) {
    Diagnostics._markInitProcessStart(sdkKey);
    tagLastMarker(sdkKey, syncType);
  },
  _markInitProcessEnd(
    sdkKey: string,
    data: Parameters<typeof Diagnostics._markInitProcessEnd>[1],
    syncType?: StatsigSyncType,
  ) {
    Diagnostics._markInitProcessEnd(sdkKey, data);
    tagLastMarker(sdkKey, syncType);
  },
  _getDiagnosticsData(
    ...args: Parameters<typeof Diagnostics._getDiagnosticsData>
  ) {
    const online =
      typeof navigator !== "undefined" ? navigator.onLine : undefined;
    return {
      ...Diagnostics._getDiagnosticsData(...args),
      ...(typeof online === "boolean" ? { hasInternet: online } : {}),
    };
  },
  _enqueueDiagnosticsEvent(
    ...args: [
      ...Parameters<typeof Diagnostics._enqueueDiagnosticsEvent>,
      syncType?: StatsigSyncType,
    ]
  ) {
    const [user, logger, sdkKey, options, syncType] = args;
    // The SDK owns duration calculation, marker removal, event time and copying.
    // Its synchronous enqueue callback is the only extra event field boundary.
    const taggedLogger = {
      enqueue(event: Parameters<typeof logger.enqueue>[0]) {
        logger.enqueue({
          ...event,
          metadata: { ...event.metadata, syncType },
        });
      },
    } as typeof logger;
    return Diagnostics._enqueueDiagnosticsEvent(
      user,
      taggedLogger,
      sdkKey,
      options,
    );
  },
};
