import { _typedJsonParse, type StatsigUser } from "@statsig/client-core";
/** Extra request/response fields present in the bundled NetworkCore, absent from npm 3.33.4. */
export interface StatsigLiveNetworkHost {
  hashAlgorithm?: string | null;
  initializeUrlConfig: unknown;
  post(args: {
    sdkKey: string;
    urlConfig: unknown;
    data: Record<string, unknown>;
    retries: number;
    isStatsigEncodable: boolean;
    priority?: "high" | "low";
    skipInitTracking: boolean;
  }): Promise<{
    code: number;
    body?: string | null;
    headers?: Pick<Headers, "get">;
  } | null>;
}
export function parseLiveOverlayCursor(
  value: string | null | undefined,
): number | null {
  if (value == null || value.trim() === "") return null;
  const cursor = Number(value);
  return Number.isFinite(cursor) && cursor >= 0 ? cursor : null;
}
/** Bundled Kc.fetchLiveEvaluations; ordinary requests stay in the upstream SDK. */
export function createStatsigLiveNetwork(host: StatsigLiveNetworkHost) {
  return async function fetchLiveEvaluations(
    sdkKey: string,
    user: StatsigUser,
    sinceTime: number,
    previousDerivedFields: unknown,
    priority?: "high" | "low",
    fullChecksum?: string | null,
  ) {
    const response = await host.post({
      sdkKey,
      urlConfig: host.initializeUrlConfig,
      data: {
        responseMode: "live_overlay",
        user,
        hash: host.hashAlgorithm ?? "djb2",
        sinceTime,
        previousDerivedFields,
        ...(fullChecksum == null ? {} : { full_checksum: fullChecksum }),
      },
      retries: 2,
      isStatsigEncodable: true,
      priority,
      skipInitTracking: true,
    });
    if (response?.code === 204) {
      const cursor = parseLiveOverlayCursor(
        response.headers?.get("x-statsig-live-overlay-lcut"),
      );
      return cursor == null
        ? { hasUpdates: false as const }
        : { hasUpdates: false as const, lcut: cursor };
    }
    if (response?.code !== 200 || response.body == null) return null;
    const values = _typedJsonParse<Record<string, unknown>>(
      response.body,
      "response_mode",
      "LiveOverlayResponse",
    );
    return values?.response_mode !== "live_overlay"
      ? null
      : { hasUpdates: true as const, values };
  };
}
