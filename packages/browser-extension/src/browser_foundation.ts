import { createExtensionUpdateManagerClass } from "./extension_updates";
import { registerClientHeartbeat } from "./client_heartbeat";
import {
  createInstallerStatus,
  createWebsiteStatusHandler,
} from "./website_status";
import {
  createTabMentionMessageRouter,
  sendTabMentionsInvalidated,
} from "./tab_mention_messages";
import {
  createTabMentionProviderClass,
  observeMentionInvalidations,
} from "./tab_mentions";
import { createChatApiClass } from "./chat_api";
import { createSiwcServiceClass } from "./siwc";
import {
  createPopupInterceptor,
  createPopupMessageHandler,
} from "./popup_interceptor";
import { createForeignFrameMonitor } from "./foreign_frame_monitor";
import { createTabAudioController } from "./tab_audio";
import { createContentRuntime } from "./content_runtime";
import { createObservedTabsClass } from "./observed_tabs";
import {
  createOverlayManagerClass,
  createCursorMessageHandler,
} from "./overlay_manager";
import { createTabFaviconManagerClass } from "./tab_favicons";
import { createTabGroupManagerClass } from "./tab_groups";
import { createNetworkPolicyManagerClass } from "./network_policy";
import { createNetworkPolicyEnforcer } from "./network_policy_enforcement";
import { createExtensionInstanceIdReader } from "./instance_id";
import { createTabLeaseManagerClass } from "./tab_leases";
import { createDebuggerRuntime } from "./debugger_runtime";
import { createTabRuntime } from "./tab_runtime";
import {
  createBrowserSessionClass,
  type BrowserSessionDependencies,
} from "./browser_session";
import {
  createBrowserCommandHandlerClass,
  type BrowserCommandDependencies,
} from "./command_handler";

export interface ExtensionBrowserHost {
  chrome: typeof chrome;
  crypto: Pick<Crypto, "randomUUID"> & Partial<Pick<Crypto, "subtle">>;
  now(): number;
  random?(): number;
  fetch?: typeof globalThis.fetch;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  error(message: string, context: { operation: string }): void;
}
/** Project composition of restored closures; not a replacement for original full dR startup. */
export function createExtensionBrowserFoundation(host: ExtensionBrowserHost) {
  const installerStatus = createInstallerStatus(host.chrome);
  const ChatApi = createChatApiClass({
    ...host,
    fetch: host.fetch ?? globalThis.fetch,
  });
  const siwc = createSiwcServiceClass({
    chrome: host.chrome,
    crypto: { subtle: host.crypto.subtle ?? globalThis.crypto.subtle },
    fetch: host.fetch ?? globalThis.fetch,
    now: host.now,
  });
  const contentRuntime = createContentRuntime(host);
  const ObservedTabs = createObservedTabsClass(host.chrome);
  const observedTabs = new ObservedTabs();
  const OverlayManager = createOverlayManagerClass({ ...host, contentRuntime });
  const overlay = new OverlayManager({ observedTabs });
  const ExtensionUpdateManager = createExtensionUpdateManagerClass(host.chrome);
  const extensionUpdates = new ExtensionUpdateManager(() =>
    overlay.isBrowserControlActive(),
  );
  const tabAudio = createTabAudioController(host.chrome);
  tabAudio.installObservedChangeHandler(observedTabs, overlay);
  const instanceId = createExtensionInstanceIdReader(host);
  const TabMentionProvider = createTabMentionProviderClass({
    ...host,
    instanceId,
  });
  const tabLeases = createTabLeaseManagerClass({ ...host, instanceId });
  const tabFavicons = createTabFaviconManagerClass({
    ...host,
    tabLeases,
    contentRuntime,
    fetch: host.fetch ?? globalThis.fetch,
  });
  const popupInterceptor = createPopupInterceptor({
    chrome: host.chrome,
    tabLeases,
    contentRuntime,
  });
  const debuggerRuntime = createDebuggerRuntime(host);
  const tabRuntime = createTabRuntime(host);
  const tabGroups = createTabGroupManagerClass({
    chrome: host.chrome,
    random: host.random ?? Math.random,
  });
  const networkPolicy = createNetworkPolicyManagerClass({
    chrome: host.chrome,
    now: host.now,
    enforceActivePage: createNetworkPolicyEnforcer(host),
  });
  const sessionBase = {
    overlay,
    muteBackgroundTab: tabAudio.muteBackgroundTab,
    trackPopupInterceptor: popupInterceptor.track,
    ensurePopupInterceptor: popupInterceptor.ensure,
    removePopupInterceptor: popupInterceptor.remove,
    ...debuggerRuntime,
    ...tabRuntime,
    tabGroups,
    tabFavicons,
    chrome: host.chrome,
    tabLeases,
    networkPolicy,
  };
  const handlerBase = {
    TabMentionProvider,
    Siwc: siwc.SiwcService,
    initializePopupInterceptor: popupInterceptor.initialize,
    overlay,
    favicons: tabFavicons,
    chrome: host.chrome,
    instanceId,
    tabLeases,
    networkPolicy,
    getTab: tabRuntime.getTab,
    initializeDebugger: debuggerRuntime.initializeDebugger,
    setTimeout: host.setTimeout,
    clearTimeout: host.clearTimeout,
  };
  let frameMonitor: ReturnType<typeof createForeignFrameMonitor> | undefined;
  function createHandlerClass(
    handlerDependencies: Omit<
      BrowserCommandDependencies,
      | keyof typeof handlerBase
      | "Session"
      | "initializeForeignExtensionFrameMonitor"
    >,
    sessionDependencies: Omit<
      BrowserSessionDependencies,
      | keyof typeof sessionBase
      | "trackFrameMonitor"
      | "ensureFrameMonitor"
      | "removeFrameMonitor"
    >,
  ) {
    frameMonitor ??= createForeignFrameMonitor({
      chrome: host.chrome,
      tabLeases,
      contentRuntime,
      isInternalUrl: (url) =>
        sessionDependencies.isInternalTab(
          handlerDependencies.browserFamily(
            handlerDependencies.navigator.userAgent,
            false,
          ),
          url,
        ),
    });
    const Session = createBrowserSessionClass({
      ...sessionDependencies,
      ...sessionBase,
      trackFrameMonitor: frameMonitor.track,
      ensureFrameMonitor: frameMonitor.ensure,
      removeFrameMonitor: frameMonitor.remove,
    });
    return createBrowserCommandHandlerClass({
      ...handlerDependencies,
      ...handlerBase,
      Session,
      initializeForeignExtensionFrameMonitor: frameMonitor.initialize,
    });
  }
  return {
    ChatApi,
    extensionUpdates,
    registerExtensionUpdates() {
      extensionUpdates.register();
      overlay.setBrowserControlActivityChangeHandler((active) => {
        if (!active)
          extensionUpdates.maybeReloadForPendingUpdate().catch(() => {});
      });
    },
    registerClientHeartbeat: (
      diagnostics: Pick<
        Parameters<typeof registerClientHeartbeat>[0],
        "reportError" | "console" | "reportMetric"
      >,
      ...pings: (() => Promise<unknown>)[]
    ) =>
      registerClientHeartbeat(
        {
          ...diagnostics,
          chrome: host.chrome,
          setTimeout: host.setTimeout,
          reconcileRequestHeaders: () =>
            tabLeases.getInstance().reconcileRequestHeaders(),
          stopActiveSessions: () => overlay.stopActiveSessions(),
          detachAllNetworkPolicies: () =>
            networkPolicy.getInstance().detachAll(),
        },
        ...pings,
      ),
    installerStatus,
    createWebsiteStatusHandler: (
      reportMetric: Parameters<
        typeof createWebsiteStatusHandler
      >[0]["reportMetric"],
    ) =>
      createWebsiteStatusHandler({
        chrome: host.chrome,
        instanceId,
        isBrowserControlActive: () => overlay.isBrowserControlActive(),
        readInstallerStatus: installerStatus.readStatus,
        reportMetric,
      }),
    TabMentionProvider,
    createTabMentionMessageRouter: (
      provider: InstanceType<typeof TabMentionProvider>,
      channel: string,
    ) => createTabMentionMessageRouter(provider, channel, host.chrome.runtime),
    sendTabMentionsInvalidated: (
      peer: Parameters<typeof sendTabMentionsInvalidated>[0],
    ) => sendTabMentionsInvalidated(peer, host.chrome.runtime),
    observeMentionInvalidations: (notify: () => void) =>
      observeMentionInvalidations(host, notify),
    siwc,
    contentRuntime,
    popupInterceptor,
    createPopupMessageHandler,
    get frameMonitor() {
      return frameMonitor;
    },
    tabAudio,
    observedTabs,
    overlay,
    createCursorMessageHandler: (
      handler: Parameters<typeof createCursorMessageHandler>[1],
    ) => createCursorMessageHandler(overlay, handler),
    instanceId,
    tabLeases,
    networkPolicy,
    debuggerRuntime,
    tabRuntime,
    tabGroups,
    tabFavicons,
    createHandlerClass,
  };
}
