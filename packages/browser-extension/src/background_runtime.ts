import {
  registerBrowserEventListeners,
  type BrowserEventHandler,
  type BrowserEventPeer,
} from "./browser_events";
import type { createBackgroundMessageRouter } from "./background_messages";

/** dR runtime registration phase, before extension lifecycle and heartbeat startup. */
export function registerBackgroundRuntime(host: {
  chrome: Pick<
    typeof chrome,
    "runtime" | "debugger" | "downloads" | "webNavigation"
  >;
  buildChannel: string;
  ensureLeases(): Promise<unknown>;
  reportError(error: unknown, stage: string): void;
  error(message: string): void;
  tabMentionPort(port: chrome.runtime.Port): void;
  nativeStatusPort(
    port: chrome.runtime.Port,
    version: string,
    channel: string,
  ): void;
  messageRouter: ReturnType<typeof createBackgroundMessageRouter>;
  handler: BrowserEventHandler;
  broadcast(send: (peer: BrowserEventPeer) => void): void;
  initializeInstanceId(): Promise<unknown>;
}) {
  host.ensureLeases().catch((error) => {
    host.reportError(error, "tab-lease-restoration");
    host.error(
      "Failed to restore tab leases for request-header reconciliation.",
    );
  });
  host.chrome.runtime.onConnect.addListener((port) => {
    host.tabMentionPort(port);
    host.nativeStatusPort(
      port,
      host.chrome.runtime.getManifest().version,
      host.buildChannel,
    );
  });
  host.chrome.runtime.onMessage.addListener(host.messageRouter);
  registerBrowserEventListeners(
    host.chrome,
    host.handler,
    host.broadcast,
    host.initializeInstanceId,
  );
}
