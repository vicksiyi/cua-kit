import { createNativeBrowserController } from "./native_browser_controller";
import { registerBrowserEventListeners } from "./browser_events";
import { createPageEventHandler } from "./background_messages";

/** Independent deployment of the restored native-control runtime. ChatGPT side-panel,
 * website installation and standalone kernel startup remain separate compositions.
 */
export async function startNativeBrowserBackground(
  options: Parameters<typeof createNativeBrowserController>[0] & {
    diagnostics: Parameters<
      ReturnType<
        typeof createNativeBrowserController
      >["foundation"]["registerClientHeartbeat"]
    >[0];
  },
) {
  const controller = createNativeBrowserController(options);
  const { foundation, handler, peer } = controller;
  const popup = foundation.createPopupMessageHandler(handler);
  const cursor = foundation.createCursorMessageHandler(handler);
  const pageEvent = createPageEventHandler({
    getActiveLease: (tabId) =>
      foundation.tabLeases.getInstance().getActiveLease(tabId),
    broadcastPageEvent: (event) => peer.sendPageEvent(event),
  });
  options.host.chrome.runtime.onMessage.addListener(
    (message, sender, reply) => {
      if (popup(message, sender, reply)) return true;
      if (pageEvent(message, sender)) return false;
      return cursor(message, sender, reply);
    },
  );
  registerBrowserEventListeners(
    options.host.chrome,
    handler,
    (send) => send(peer),
    foundation.instanceId,
  );
  foundation.tabLeases
    .getInstance()
    .ensureInit()
    .catch((error) => {
      options.diagnostics.reportError(error, "tab-lease-restoration");
      options.diagnostics.console.error(
        "Failed to restore tab leases for request-header reconciliation.",
      );
    });
  foundation.registerExtensionUpdates();
  await foundation.registerClientHeartbeat(options.diagnostics, () =>
    peer.ping(),
  );
  return controller;
}
