import type { BrowserRpcTransport } from "@core/core/browserRpcPeer";
import type { BrowserCommandOptions } from "./command_handler";
import type { BrowserEventHandler, BrowserEventPeer } from "./browser_events";
import { createBackgroundMessageRouter } from "./background_messages";
import { createBackgroundMentionInvalidationStarter } from "./background_mentions";
import { registerBackgroundRuntime } from "./background_runtime";
import {
  registerBackgroundKernel,
  type BackgroundKernelPeer,
} from "./kernel_background";

type MessageHandler = (
  message: any,
  sender: chrome.runtime.MessageSender,
  reply: (value?: any) => void,
) => boolean;
interface Peer extends BrowserEventPeer {
  ping(): Promise<unknown>;
  sendPageEvent(event: unknown): void;
  sendBrowserTabMentionsInvalidated(): void;
}
interface Handler extends BrowserEventHandler {
  turnEnded(metadata: unknown): Promise<unknown>;
  handleAgentBackgroundPopup(tabId: number, url: string): Promise<unknown>;
}
interface Provider {
  subscribeInvalidations(notify: () => void): unknown;
}
interface Installation {
  refresh(): void;
}
/** Dependencies are actual restored services at the original dR boundaries.
 * No default auth, feature, lifecycle or kernel implementation is fabricated.
 */
export interface BackgroundStartupHost {
  chrome: Pick<
    typeof chrome,
    "runtime" | "debugger" | "downloads" | "webNavigation" | "sidePanel"
  >;
  buildChannel(value: string): string;
  nativeHosts(channel: string): string[];
  sidePanelEnabled(): boolean;
  createInstallation(onInstalled: () => Promise<unknown>): Installation;
  refreshWebsite(channel: string, notify: boolean): Promise<unknown>;
  clearActionCallout(value: string): Promise<unknown>;
  createUpdates(active: () => boolean): {
    register(): void;
    maybeReloadForPendingUpdate(): Promise<unknown>;
  };
  isControlActive(): boolean;
  onControlActivity(callback: (active: boolean) => void): void;
  createMentionProvider(channel: string, observe: () => void): Provider;
  observeMentionInvalidations(notify: () => void): unknown;
  createHandler(options: BrowserCommandOptions): Handler;
  createWebMcpConfig(): NonNullable<BrowserCommandOptions["webMcpConfig"]>;
  isEnabled(name: string): Promise<boolean>;
  observeGate(
    name: string,
    callback: (enabled: boolean) => void,
    signal: AbortSignal,
  ): Promise<unknown>;
  registerKernelConnections(
    connected: (
      id: string,
      browser: BrowserRpcTransport,
      control: BrowserRpcTransport,
    ) => void,
    disconnected: (id: string) => void,
  ): void;
  createControl(id: string): unknown;
  createControlPeer(
    transport: BrowserRpcTransport,
    control: unknown,
  ): BackgroundKernelPeer["control"];
  createBrowserPeer(transport: BrowserRpcTransport, handler: Handler): Peer;
  registerTurnEnded(
    callback: (id: string, metadata: unknown) => Promise<void>,
  ): Promise<unknown>;
  reportTurnEndedError(error: unknown): void;
  createNativeTransport(hosts: string[]): BrowserRpcTransport;
  registerToolbarState(): void;
  registerSidePanelEntrypoints(): void;
  registerSidePanelTabs(): unknown;
  createSidePanelAuth(url: string, changed: () => void): MessageHandler;
  refreshAuth(): Promise<unknown>;
  ensureLeases(): Promise<unknown>;
  getLease(tabId: number): Promise<{ sessionId: string } | null | undefined>;
  tabMentionPort(
    provider: Provider,
    channel: string,
    port: chrome.runtime.Port,
  ): void;
  nativeStatusPort(
    transport: BrowserRpcTransport,
    version: string,
    channel: string,
    port: chrome.runtime.Port,
  ): void;
  sidePanelInstance: MessageHandler;
  refreshBrowserSettings(control: unknown): Promise<unknown>;
  tabMentionMessage(
    provider: Provider,
    channel: string,
    message: any,
    sender: chrome.runtime.MessageSender,
    reply: (value?: any) => void,
  ): boolean;
  youtubeTimestamp(message: any, reply: (value?: any) => void): boolean;
  showInstaller(
    message: any,
    sender: chrome.runtime.MessageSender,
    channel: string,
  ): boolean;
  sidePanelLoad: MessageHandler;
  openSidePanel(
    message: any,
    sender: chrome.runtime.MessageSender,
    channel: string,
  ): boolean;
  cursor(
    handler: Handler,
    message: any,
    sender: chrome.runtime.MessageSender,
    reply: (value?: any) => void,
  ): boolean;
  initializeInstanceId(): Promise<unknown>;
  registerLifecycle(options: {
    buildChannel: string;
    sidePanelEnabled: boolean;
    browserPluginInstallation: Installation;
  }): unknown;
  initializeObservedTabs(): Promise<unknown>;
  registerHeartbeat(...pings: (() => Promise<unknown>)[]): Promise<unknown>;
  reportError(error: unknown, stage: string): void;
  console: Pick<Console, "warn" | "error">;
}
/** Restored dR startup ordering, shared handler, lazy native capture and live kernel fanout.
 * Full deployment must supply all services; the independent native entry is separate.
 */
export async function startExtensionBackground(
  host: BackgroundStartupHost,
): Promise<void> {
  const channel = host.buildChannel("prod");
  const nativeHosts = host.nativeHosts(channel);
  const sidePanelEnabled = host.sidePanelEnabled();
  const installation = host.createInstallation(() =>
    host.refreshWebsite(channel, true),
  );
  host.clearActionCallout("").catch(() => {});
  const updates = host.createUpdates(() => host.isControlActive());
  const peers = new Map<string, BackgroundKernelPeer & { browser: Peer }>();
  let nativePeer: Peer | null = null;
  const observe = createBackgroundMentionInvalidationStarter({
    nativePeer: () => nativePeer,
    kernelPeers: () => peers.values(),
    runtime: host.chrome.runtime,
    observeTabs: host.observeMentionInvalidations,
    subscribeProvider: (notify) => provider.subscribeInvalidations(notify),
  });
  const provider = host.createMentionProvider(channel, observe);
  const handler = host.createHandler({
    buildChannel: channel,
    browserTabMentionProvider: provider,
    webMcpConfig: host.createWebMcpConfig(),
    browserManagementEnabled: host
      .isEnabled("codex-app-chrome-extension-browser-management")
      .catch(() => false),
    agentPopupInterceptorEnabled: host
      .isEnabled("codex-app-chrome-extension-background-popups")
      .catch(() => false),
  });
  registerBackgroundKernel({
    peers,
    createControl: host.createControl,
    createControlPeer: host.createControlPeer,
    createBrowserPeer: (transport) =>
      host.createBrowserPeer(transport, handler),
    registerConnections: host.registerKernelConnections,
    registerTurnEnded: host.registerTurnEnded,
    turnEnded: (metadata) => handler.turnEnded(metadata),
    observeGate: (callback, signal) =>
      host.observeGate("chrome-standalone-js-kernel", callback, signal),
    reportGateError: host.reportError,
    warn: host.console.warn,
    reportTurnEndedError: host.reportTurnEndedError,
  });
  updates.register();
  host.onControlActivity((active) => {
    if (!active) updates.maybeReloadForPendingUpdate().catch(() => {});
  });
  const transport = host.createNativeTransport(nativeHosts);
  // Preserve original short-circuit order, including registration before sidePanel check.
  if (sidePanelEnabled) {
    host.registerToolbarState();
    host.registerSidePanelEntrypoints();
    if (host.chrome.sidePanel != null) host.registerSidePanelTabs();
  }
  const sidePanelAuth = sidePanelEnabled
    ? host.createSidePanelAuth(
        "https://chatgpt.com/?surface=browser_side_chat",
        () => {
          installation.refresh();
          host.refreshAuth().catch(() => {});
        },
      )
    : () => false;
  const peer = host.createBrowserPeer(transport, handler);
  const broadcast = (send: (peer: Peer) => void) => {
    for (const { browser } of peers.values()) send(browser);
    send(peer);
  };
  nativePeer = peer;
  const messageRouter = createBackgroundMessageRouter({
    runtimeId: host.chrome.runtime.id,
    buildChannel: channel,
    sidePanelInstance: host.sidePanelInstance,
    sidePanelAuth,
    controls: () =>
      Array.from(peers.values(), ({ controlImpl }) => controlImpl),
    refreshBrowserSettings: host.refreshBrowserSettings,
    handleAgentBackgroundPopup: (tabId, url) =>
      handler.handleAgentBackgroundPopup(tabId, url),
    getActiveLease: host.getLease,
    broadcastPageEvent: (event) =>
      broadcast((target) => target.sendPageEvent(event)),
    tabMentions: (...args) =>
      host.tabMentionMessage(provider, channel, ...args),
    youtubeTimestamp: host.youtubeTimestamp,
    showInstaller: (message, sender) =>
      host.showInstaller(message, sender, channel),
    sidePanelLoad: host.sidePanelLoad,
    openSidePanel: (message, sender) =>
      host.openSidePanel(message, sender, channel),
    cursor: (...args) => host.cursor(handler, ...args),
  });
  registerBackgroundRuntime({
    chrome: host.chrome,
    buildChannel: channel,
    ensureLeases: host.ensureLeases,
    reportError: host.reportError,
    error: host.console.error,
    tabMentionPort: (port) => host.tabMentionPort(provider, channel, port),
    nativeStatusPort: (port, version, build) =>
      host.nativeStatusPort(transport, version, build, port),
    messageRouter,
    handler,
    broadcast: (send) => broadcast(send),
    initializeInstanceId: host.initializeInstanceId,
  });
  host.registerLifecycle({
    buildChannel: channel,
    sidePanelEnabled,
    browserPluginInstallation: installation,
  });
  await host.initializeObservedTabs();
  await host.registerHeartbeat(
    () => peer.ping(),
    () =>
      Promise.any(Array.from(peers.values(), ({ browser }) => browser.ping())),
  );
}
