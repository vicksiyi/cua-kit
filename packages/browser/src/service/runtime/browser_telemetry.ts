import { createBrowserFeatureClients } from "./browser_feature_clients";
import { StatsigClient, type StatsigUser } from "@statsig/js-client";
import { environmentString } from "../capability_filter";
import { securityMode } from "../security/gate_policy";
import { siteStatusBackend } from "../security/site_status";
import { errorReporterUserId } from "./telemetry_identity";

interface TelemetryRuntime {
  env: Record<string, any>;
  platform?: string;
  gaas?: { browserConfig: { user_id?: string } };
  fetch: (...args: any[]) => Promise<any>;
}
interface TelemetryReporter {
  setTag(name: string, value: string): void;
  setUser(user: any): void;
}
type Ready = ReturnType<StatsigClient["initializeAsync"]>;
interface ClientState {
  client: StatsigClient;
  browserClientBuild: string;
  codexAppVersion?: string;
  initialized: boolean;
  user: StatsigUser;
  initialization?: Ready;
  ready?: Ready;
}
const timeoutMs = 10_000;
const release = "1.0.0";
const disabled = (runtime: Pick<TelemetryRuntime, "env">) =>
  environmentString(runtime, "BROWSER_USE_DISABLE_AMBIENT_NETWORK") === "1";
const trimmed = (runtime: TelemetryRuntime, name: string) =>
  environmentString(runtime, name)?.trim() || undefined;
export function browserTelemetryMetadata(info: any) {
  return {
    backend: info.type,
    browser_family:
      info.type === "extension" ? (info.family ?? "unknown") : "not_applicable",
  };
}
/** Original qn/wh/_h plus fv..zM and gv..dt. Each factory owns one service lifetime.
 * Statsig itself is the upstream 3.33.1 dependency, not reconstructed vendor code. */
export function createBrowserTelemetry(
  Client: typeof StatsigClient = StatsigClient,
) {
  let state: ClientState | undefined;
  let identity: any = null;
  let identityReady: Promise<void> | undefined;
  let exceptionReporter: ((...args: any[]) => any) | undefined;
  function setExceptionReporter(reporter: typeof exceptionReporter) {
    exceptionReporter = reporter;
  }
  function reportError(error: any, context?: any) {
    exceptionReporter?.(error, context);
  }
  function createClient(runtime: TelemetryRuntime, user: StatsigUser) {
    return new Client(
        "client-sYWqzCYMRkUg4DqqiZcR5DGTNl2iD7zNJY0HoeDLzxR",
        user,
        {
          environment: { tier: "production" },
          networkConfig: {
            api: "https://ab.chatgpt.com/v1",
            sdkExceptionUrl: "https://ab.chatgpt.com/v1/sdk_exception",
            networkOverrideFunc: (url, options) => runtime.fetch(url, options),
          },
          loggingEnabled: "always",
        },
      );
  }
  const browserFeatures = createBrowserFeatureClients({parent: () => state, disabled, createClient, reportError});
  async function prepareBrowserFeatures(runtime: TelemetryRuntime, info: any) {
    if (disabled(runtime) || identityReady == null) return;
    try { await Promise.all([initializeClient(runtime), identityReady]); } catch { return; }
    await browserFeatures.initialize(runtime, info);
  }
  function getClient(runtime: TelemetryRuntime) {
    if (state != null) return state;
    const codexAppVersion = trimmed(runtime, "BROWSER_USE_CODEX_APP_VERSION");
    const browserClientBuild =
      trimmed(runtime, "BROWSER_USE_BROWSER_CLIENT_BUILD") ?? "0.1.1";
    const user: StatsigUser = {
      appVersion: browserClientBuild,
      userID: errorReporterUserId(runtime),
      custom: {
        browserClientBuild,
        platform: runtime.platform,
        codexAppVersion: codexAppVersion ?? release,
      },
    };
    state = {
      client: createClient(runtime, user),
      browserClientBuild,
      codexAppVersion,
      initialized: false,
      user,
    };
    return state;
  }
  async function waitForReady(client: ClientState, deadline?: number) {
    const remaining = Math.min(
      timeoutMs,
      deadline == null ? timeoutMs : Math.max(0, deadline - Date.now()),
    );
    const until = performance.now() + remaining;
    const error = new Error("Timed out waiting for Statsig values.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(error), remaining);
      });
      await Promise.race([client.initialization, timeout]);
      while (performance.now() < until) {
        const ready = client.ready;
        const result = await Promise.race([ready, timeout]);
        if (ready === client.ready) return result;
      }
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  async function initializeClient(runtime: TelemetryRuntime) {
    const client = getClient(runtime);
    try {
      if (client.initialization == null) {
        client.initialization = client.client.initializeAsync({ timeoutMs });
        client.ready = client.initialization;
      }
      await client.initialization;
      await waitForReady(client);
      client.initialized = true;
    } catch (error) {
      console.warn(error);
      reportError(error);
    }
  }
  async function readFeatureGate(name: string, deadline?: number) {
    const client = state;
    if (client?.initialization == null)
      throw new Error("Browser feature gates require Statsig initialization.");
    if (
      !(await waitForReady(client, deadline))?.success ||
      client.client.loadingStatus !== "Ready"
    )
      throw new Error(
        "Unable to load browser feature gates. Retry the browser command.",
      );
    const gate = client.client.getFeatureGate(name);
    if (!gate.details.reason.endsWith(":Recognized"))
      throw new Error(
        "Browser feature gate is unavailable. Check its Statsig configuration.",
      );
    return gate.value;
  }
  function featureEnabled(
    runtime: TelemetryRuntime,
    name: string,
    { enabledByDefault = false } = {},
  ) {
    return (
      state != null &&
      !disabled(runtime) &&
      state.initialized &&
      (enabledByDefault || state.client.checkGate(name))
    );
  }
  function dynamicConfig(name: string) {
    return state?.initialized ? state.client.getDynamicConfig(name) : undefined;
  }
  function updateClientUser(client: ClientState) {
    client.ready = client.client.updateUserAsync(client.user, { timeoutMs });
    return client.ready;
  }
  function setClientBackend(runtime: TelemetryRuntime, backend: string) {
    const client = getClient(runtime);
    if (client.user.custom?.backend !== backend) {
      client.user = {
        ...client.user,
        custom: { ...client.user.custom, backend },
      };
      updateClientUser(client).catch(reportError);
    }
  }
  async function updateClientIdentity(
    runtime: TelemetryRuntime,
    { email, id }: { email?: string; id: string },
  ) {
    const client = getClient(runtime);
    if (client.user.userID === id && client.user.email === email) {
      const ready = client.ready;
      if ((await ready)?.success || client.ready !== ready) return client.ready;
    }
    client.user = { ...client.user, email, userID: id };
    return updateClientUser(client);
  }
  function logEvent(
    runtime: Pick<TelemetryRuntime, "env">,
    name: string,
    value?: string | number,
    metadata?: Record<string, any>,
  ) {
    if (state != null)
      return state.client.logEvent(name, value, {
        ...metadata,
        browserClientBuild: state.browserClientBuild,
        codexAppVersion: state.codexAppVersion ?? release,
      });
  }
  async function fetchIdentity(runtime: TelemetryRuntime) {
    if (identity != null) return identity;
    const response = await runtime.fetch(
      `${siteStatusBackend(runtime)}/aura/identity`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    const user = await response.json();
    if (
      !response.ok ||
      user?.object !== "user" ||
      typeof user.id !== "string" ||
      !user.id.trim()
    )
      throw new Error("User unavailable");
    return (identity = user);
  }
  function configureBackendTelemetry(
    runtime: TelemetryRuntime,
    reporter: TelemetryReporter,
    backend: string,
  ) {
    if (!disabled(runtime)) {
      reporter.setTag("backend", backend);
      setClientBackend(runtime, backend);
    }
  }
  function configureTurnTelemetry(
    runtime: TelemetryRuntime,
    reporter: TelemetryReporter,
  ) {
    if (!disabled(runtime)) {
      identityReady = (async () => {
        const user = await fetchIdentity(runtime);
        reporter.setUser(user);
        await updateClientIdentity(runtime, user);
      })();
      return identityReady.catch(reportError);
    }
  }
  function configureRuntimeTelemetry(
    runtime: TelemetryRuntime,
    reporter: TelemetryReporter,
  ) {
    if (!disabled(runtime)) {
      if (securityMode(runtime) === "gaas-browser-environment")
        configureBackendTelemetry(runtime, reporter, "cdp");
      return Promise.all([
        initializeClient(runtime),
        configureTurnTelemetry(runtime, reporter),
      ]).then(() => {});
    }
  }
  async function readBrowserFeatureGate(name: string, deadline?: number) {
    if (identityReady == null)
      throw new Error("Browser feature gates require caller identity.");
    const pending = identityReady.then(() => readFeatureGate(name));
    if (deadline == null) return pending;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error("Timed out waiting for browser feature gate.")),
            Math.max(0, deadline - Date.now()),
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  function emitEvent(
    runtime: Pick<TelemetryRuntime, "env">,
    name: string,
    value?: string | number,
    metadata?: Record<string, any>,
    info?: any,
  ) {
    if (!disabled(runtime))
      return logEvent(runtime, `codex_${name}`, value, {
        browser_family: "not_applicable",
        ...(info == null ? {} : browserTelemetryMetadata(info)),
        ...metadata,
      });
  }
  return {
    prepareBrowserFeatures,
    browserFeatureEnabled: browserFeatures.enabled,
    setExceptionReporter,
    reportError,
    initializeClient,
    readFeatureGate,
    featureEnabled,
    dynamicConfig,
    setClientBackend,
    updateClientIdentity,
    logEvent,
    fetchIdentity,
    configureBackendTelemetry,
    configureTurnTelemetry,
    configureRuntimeTelemetry,
    readBrowserFeatureGate,
    emitEvent,
    reportNotificationError: reportError,
  };
}
export const browserTelemetry = createBrowserTelemetry();
