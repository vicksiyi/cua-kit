import { createExtensionBackground } from "./background_assembly";
import { createTunnelKernelBindings } from "./tunnel_kernel_bindings";
import { createPageTelemetryInitializer } from "./page_telemetry";
import { browserFamilies, identifyBrowserFamily } from "./browser_platform";

export interface FullBackgroundConfiguration {
  channel: "dev" | "internal" | "prod";
  nativeHosts: string[];
  sidePanelEnabled: boolean;
  features: { sdkKey: string; api: string };
  telemetryDsn: string;
  siteStatusUrl: string;
  defaultAllowedPages: string[];
}

/** Browser capabilities are passed as their real objects, retaining native method
 * receivers. This boundary also permits isolated extension integration fixtures. */
export interface FullBackgroundEnvironment {
  chrome: typeof chrome;
  crypto: Crypto;
  navigator: { userAgent: string; onLine?: boolean; [key: string]: unknown };
  scope: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  fetch: typeof globalThis.fetch;
  now(): number;
  monotonicNow(): number;
  random(): number;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
  console: Pick<Console, "info" | "warn" | "error">;
}

/** Concrete composition of restored dR, S_, kernel control, PDF, offscreen and
 * native transports. It leaves original auth/feature/consent decisions intact.
 * Construction is inert; callers explicitly invoke .start() to start listeners.
 */
export function createFullBrowserBackground(
  configuration: FullBackgroundConfiguration,
  environment: FullBackgroundEnvironment,
) {
  const browser = environment.chrome;
  const family = identifyBrowserFamily(
    environment.navigator.userAgent,
    "brave" in environment.navigator,
  );
  const metric = (name: string, data: unknown) =>
    environment.console.info("[core-cua]", name, data);
  const warn = (message: string, detail?: unknown) =>
    environment.console.warn(message, detail);
  const error = (value: unknown, stage: string) =>
    environment.console.error("[core-cua]", stage, value);
  const initializeTelemetry = createPageTelemetryInitializer(
    { runtime: browser.runtime, fetch: environment.fetch },
    { dsn: configuration.telemetryDsn, channel: configuration.channel },
  );
  return createExtensionBackground({
    host: {
      chrome: browser,
      crypto: environment.crypto,
      now: environment.now,
      random: environment.random,
      fetch: environment.fetch,
      setTimeout: environment.setTimeout,
      clearTimeout: environment.clearTimeout,
      error: (message, context) => error(message, context.operation),
    },
    navigator: environment.navigator,
    channel: configuration.channel,
    nativeHosts: configuration.nativeHosts,
    sidePanelEnabled: configuration.sidePanelEnabled,
    scope: environment.scope,
    features: configuration.features,
    kernel: (foundation) =>
      createTunnelKernelBindings({
        foundation,
        chrome: browser,
        kernelHost: {
          runtime: {
            getURL: (path) => browser.runtime.getURL(path),
            getContexts: (filter) =>
              browser.runtime.getContexts(
                filter as chrome.runtime.ContextFilter,
              ),
            sendMessage: (message) => browser.runtime.sendMessage(message),
          },
          offscreen: {
            createDocument: (options) =>
              browser.offscreen.createDocument(
                options as chrome.offscreen.CreateParameters,
              ),
          },
          randomUUID: () => environment.crypto.randomUUID(),
        },
        browserShortDisplayName: () => browserFamilies[family].shortDisplayName,
        environment: {
          fetch: environment.fetch,
          now: environment.monotonicNow,
          wallNow: environment.now,
          random: environment.random,
          setTimeout: environment.setTimeout,
          clearTimeout: environment.clearTimeout,
          randomUUID: () => environment.crypto.randomUUID(),
          version: () => browser.runtime.getManifest().version,
          online: () => environment.navigator.onLine,
          warn,
          reportPollingState: (state, reason, status) =>
            metric("tunnel_polling", { state, reason, status }),
          reportResponseFailure: (reason, responseType, status) =>
            metric("tunnel_response_failure", { reason, responseType, status }),
        },
        reportSetup: (trace) => metric("tunnel_setup", trace),
        reportIdle: () => metric("tunnel_idle", {}),
        siteStatusUrl: new URL(configuration.siteStatusUrl),
        defaultAllowedPages: configuration.defaultAllowedPages,
        setInterval: environment.setInterval,
        clearInterval: environment.clearInterval,
      }),
    telemetry: {
      initialize: () => initializeTelemetry("background"),
      reportError: error,
      reportTurnEndedError: (value) => error(value, "turn-ended"),
    },
    console: environment.console,
  });
}
