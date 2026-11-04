export const CLIENT_HEARTBEAT_ALARM = "client-heartbeat-alarm";
/** Original Gk/Ho. Promise.any uses the first fulfilled value, including false. */
export async function registerClientHeartbeat(
  host: {
    chrome: Pick<typeof chrome, "alarms" | "debugger">;
    setTimeout: typeof setTimeout;
    reconcileRequestHeaders(): Promise<void>;
    stopActiveSessions(): Promise<unknown>;
    detachAllNetworkPolicies(): Promise<void>;
    reportError(error: unknown, operation: string): void;
    console: Pick<Console, "error" | "warn">;
    reportMetric(
      name: string,
      value: number,
      metadata: Record<string, string>,
    ): void;
  },
  ...pings: (() => Promise<unknown>)[]
) {
  if (!(await host.chrome.alarms.get(CLIENT_HEARTBEAT_ALARM)))
    await host.chrome.alarms.create(CLIENT_HEARTBEAT_ALARM, {
      periodInMinutes: 0.5,
    });
  host.chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== CLIENT_HEARTBEAT_ALARM) return;
    host.reconcileRequestHeaders().catch((error) => {
      host.reportError(error, "header-reconciliation");
      host.console.error(
        "Failed to read tab leases for request-header reconciliation.",
      );
    });
    try {
      const timeout = new Promise<boolean>((resolve) =>
        host.setTimeout(() => resolve(false), 3000),
      );
      if (await Promise.any([timeout, ...pings.map((ping) => ping())])) return;
    } catch {}
    await host.stopActiveSessions();
    const targets = await host.chrome.debugger.getTargets();
    await Promise.allSettled(
      targets
        .filter((target) => typeof target.tabId === "number")
        .map((target) =>
          host.chrome.debugger.detach({ tabId: target.tabId }).catch(() => {}),
        ),
    );
    host.detachAllNetworkPolicies().catch(() => {
      host.console.warn("Browser Use network policy detachment failed");
      host.reportMetric(
        "codex_chrome_extension_network_policy_detach_failed",
        1,
        {},
      );
    });
  });
}
