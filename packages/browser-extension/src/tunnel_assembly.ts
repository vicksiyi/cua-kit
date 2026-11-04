import type { createExtensionBrowserFoundation } from "./browser_foundation";
import type { createKernelTunnelRuntime } from "./kernel_tunnel_runtime";
import {
  createTunnelPollingManager,
  readTunnelConfiguration,
} from "./tunnel_polling";
import {
  startTunnelCoordinator,
  type TunnelCoordinatorHost,
} from "./tunnel_coordinator";
import type { TunnelHttpEnvironment } from "./tunnel_http_server";
import type { TunnelUnauthorizedRecovery } from "./tunnel_response_delivery";
/** Full S_/E_/p_ service composition. Invocation starts the actual auth/setup
 * lifecycle; callers retain the original feature-gate/startup decision. */
export function startAssembledBrowserTunnel(
  options: {
    foundation: Pick<
      ReturnType<typeof createExtensionBrowserFoundation>,
      "setupBrowserTunnel" | "createTunnelActivity"
    >;
    runtime: ReturnType<typeof createKernelTunnelRuntime>;
    chrome: Pick<typeof chrome, "storage" | "webNavigation" | "alarms">;
    environment: TunnelHttpEnvironment;
    reportSetup: TunnelCoordinatorHost["reportSetup"];
    reportIdle(): void;
  },
  onTurnEnded: (id: string, metadata: unknown) => Promise<unknown>,
) {
  const { foundation, runtime, chrome: browser, environment } = options;
  const readConfiguration = () =>
    readTunnelConfiguration(browser.storage.session);
  return startTunnelCoordinator(
    {
      chrome: browser,
      now: () => environment.wallNow(),
      setTimeout: (callback, ms) => environment.setTimeout(callback, ms),
      clearTimeout: (timer) => environment.clearTimeout(timer),
      warn: (message) => environment.warn(message),
      reportSetup: options.reportSetup,
      setup: foundation.setupBrowserTunnel,
      readConfiguration,
      createActivity: (onListening) =>
        foundation.createTunnelActivity(onListening, options.reportIdle),
      createPolling: (end, onInvalid, suspended, onUnauthorized, activity) =>
        createTunnelPollingManager(
          {
            readConfiguration,
            storageChanges: browser.storage.onChanged,
            warn: (message) => environment.warn(message),
            createPoller: (config, invalid, recover) =>
              runtime.createTunnel(
                config,
                environment,
                end,
                activity,
                async (reason) => {
                  await invalid(reason);
                },
                recover,
              ),
          },
          onInvalid,
          suspended,
          (config, retry) =>
            onUnauthorized(
              config,
              retry as Parameters<TunnelUnauthorizedRecovery>[0],
            ),
        ),
    },
    onTurnEnded,
  );
}
