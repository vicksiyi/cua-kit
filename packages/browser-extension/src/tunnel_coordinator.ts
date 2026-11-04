import type { TunnelConfiguration } from "./tunnel_polling";
import type { TunnelSetupOutcome, TunnelSetupTrace } from "./tunnel_setup";
import type { createTunnelActivity } from "./tunnel_activity";
import type { TunnelUnauthorizedRecovery } from "./tunnel_response_delivery";
type Activity = Awaited<ReturnType<typeof createTunnelActivity>>;
export interface CoordinatedPolling {
  suspend(): void;
  resume(): Promise<void>;
  setListening(value: boolean): Promise<void>;
  ensurePolling(): Promise<void>;
  stop(): void;
}
export interface TunnelCoordinatorHost {
  chrome: Pick<typeof chrome, "webNavigation" | "alarms"> & {
    storage: { session: { remove(key: string): Promise<void> } };
  };
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
  warn(message: string): void;
  reportSetup(trace: TunnelSetupTrace & { outcome: TunnelSetupOutcome }): void;
  setup(
    trace: TunnelSetupTrace,
    signal: AbortSignal,
    invalidTunnelId?: string,
  ): Promise<TunnelSetupOutcome>;
  readConfiguration(): Promise<TunnelConfiguration | null>;
  createActivity(onListening: (value: boolean) => void): Promise<Activity>;
  createPolling(
    onTurnEnded: (id: string, metadata: unknown) => Promise<unknown>,
    onInvalid: (config: TunnelConfiguration, reason: string) => Promise<void>,
    suspended: boolean,
    onUnauthorized: (
      config: TunnelConfiguration,
      retry: Parameters<TunnelUnauthorizedRecovery>[0],
    ) => Promise<boolean>,
    activity: Pick<Activity, "turnStarted" | "turnEnded">,
  ): Promise<CoordinatedPolling>;
}
/** Original m_: de-duplicate setup diagnostics by serialized outcome. */
export function createTunnelSetupReporter(
  report: TunnelCoordinatorHost["reportSetup"],
) {
  let previous: string | undefined;
  return (trace: TunnelSetupTrace, outcome: TunnelSetupOutcome) => {
    const event = { ...trace, outcome };
    const serialized = JSON.stringify(event);
    if (serialized !== previous) {
      previous = serialized;
      report(event);
    }
  };
}
const retryAlarm = "browser-use-tunnel-retry",
  healthAlarm = "browser-use-tunnel-health";
/** Original S_: serial refresh with latest-generation cancellation, bounded
 * unauthorized recovery, health alarm and explicit stop. */
export async function startTunnelCoordinator(
  host: TunnelCoordinatorHost,
  onTurnEnded: (id: string, metadata: unknown) => Promise<unknown>,
) {
  let queued = Promise.resolve(false),
    generation = 0,
    controller: AbortController | undefined;
  let expiresAt = Infinity,
    unauthorizedAfter = 0,
    stopped = false;
  const report = createTunnelSetupReporter(host.reportSetup);
  const refresh = (
    trigger: string,
    invalidTunnelId?: string,
    recovery?: {
      config: TunnelConfiguration;
      retry: Parameters<TunnelUnauthorizedRecovery>[0];
    },
  ) => {
    if (stopped) return Promise.resolve(false);
    if (trigger === "unauthorized") {
      const now = host.now();
      if (now < unauthorizedAfter) return Promise.resolve(false);
      unauthorizedAfter = now + 30000;
    }
    const current = ++generation;
    controller?.abort();
    polling.suspend();
    const run = async () => {
      if (stopped || current !== generation) return false;
      const trace: TunnelSetupTrace = {
        trigger,
        stage: "session",
        invalid_tunnel_id: invalidTunnelId,
      };
      let outcome: TunnelSetupOutcome = "failed";
      const active = new AbortController();
      controller = active;
      expiresAt = host.now() + 60000;
      const timer = host.setTimeout(
        () => active.abort(new Error("Browser-use tunnel setup timed out.")),
        60000,
      );
      try {
        outcome = await host.setup(trace, active.signal, invalidTunnelId);
        if (
          recovery == null ||
          outcome === "failed" ||
          outcome === "invalid_session"
        )
          return false;
        const next = await host.readConfiguration();
        active.signal.throwIfAborted();
        const prior = recovery.config;
        if (
          stopped ||
          current !== generation ||
          next == null ||
          next.account.userId !== prior.account.userId ||
          next.account.id !== prior.account.id ||
          next.account.structure !== prior.account.structure ||
          next.baseUrl !== prior.baseUrl ||
          next.tunnelId !== prior.tunnelId ||
          next.apiKey === prior.apiKey
        )
          return false;
        return await recovery.retry(next.apiKey, active.signal);
      } finally {
        host.clearTimeout(timer);
        if (controller === active) {
          controller = undefined;
          expiresAt = Infinity;
        }
        report(trace, outcome);
        if (!stopped && current === generation) {
          if (outcome === "failed")
            await host.chrome.storage.session.remove("nodeReplTunnel");
          if (!stopped && current === generation) await polling.resume();
          const status = trace.http_status;
          if (
            outcome === "failed" &&
            (status == null ||
              status < 400 ||
              status === 408 ||
              status === 429 ||
              status >= 500) &&
            (await host.readConfiguration()) == null &&
            !stopped
          )
            await host.chrome.alarms.create(retryAlarm, {
              delayInMinutes: 0.5,
            });
          else await host.chrome.alarms.clear(retryAlarm);
        }
      }
    };
    queued = queued.then(run, run);
    return queued;
  };
  const warnRefresh = () =>
    host.warn("[node-repl-tunnel] failed to update browser-use tunnel");
  const navigated = (
    event: chrome.webNavigation.WebNavigationFramedCallbackDetails,
  ) => {
    if (
      event.frameId === 0 &&
      new URL(event.url).origin === "https://chatgpt.com"
    )
      refresh("navigation").catch(warnRefresh);
  };
  const polling = await host.createPolling(
    onTurnEnded,
    async (config, reason) => {
      await refresh(
        reason,
        reason === "invalid_tunnel" ? config.tunnelId : undefined,
      );
    },
    true,
    (config, retry) =>
      refresh("unauthorized", undefined, { config, retry }).catch(() => {
        host.warn("[node-repl-tunnel] failed to recover tunnel response");
        return false;
      }),
    {
      turnStarted: (turn) => activity.turnStarted(turn),
      turnEnded: (turn) => activity.turnEnded(turn),
    },
  );
  const activity = await host.createActivity((value) => {
    polling
      .setListening(value)
      .catch(() =>
        host.warn("[node-repl-tunnel] failed to update tunnel listening"),
      );
  });
  host.chrome.webNavigation.onCompleted.addListener(navigated, {
    url: [{ hostEquals: "chatgpt.com" }],
  });
  const alarm = (event: chrome.alarms.Alarm) => {
    if (stopped) return;
    if (event.name === healthAlarm) {
      if (host.now() >= expiresAt)
        controller?.abort(new Error("Browser-use tunnel setup timed out."));
      activity.refresh();
      polling
        .ensurePolling()
        .catch(() =>
          host.warn("[node-repl-tunnel] failed to ensure tunnel polling"),
        );
      return;
    }
    if (event.name === retryAlarm) refresh("retry").catch(warnRefresh);
  };
  host.chrome.alarms.onAlarm.addListener(alarm);
  await host.chrome.alarms.create(healthAlarm, { periodInMinutes: 1 });
  await refresh("startup").catch(warnRefresh);
  return () => {
    stopped = true;
    generation++;
    controller?.abort();
    activity.stop();
    host.chrome.webNavigation.onCompleted.removeListener(navigated);
    host.chrome.alarms.onAlarm.removeListener(alarm);
    host.chrome.alarms
      .clear(retryAlarm)
      .catch(() =>
        host.warn("[node-repl-tunnel] failed to clear tunnel retry alarm"),
      );
    host.chrome.alarms
      .clear(healthAlarm)
      .catch(() =>
        host.warn("[node-repl-tunnel] failed to clear tunnel health alarm"),
      );
    polling.stop();
  };
}
