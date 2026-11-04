import { browserFamilies, identifyBrowserFamily, isBrowserInternalTab, isBrowserNewTab, extensionBuildChannel } from "./browser_platform";
import { createBrowserTabsReader, createBrowserHistoryReader, createCursorAvailability, validateBrowserTabId, validateBrowserMouse } from "./browser_queries";
import { registerAssembledBackgroundKernel } from "./kernel_background_assembly";
import { registerKernelConnections } from "./kernel_transport";
import { registerBackgroundRuntime } from "./background_runtime";
import { createBackgroundMessageRouter } from "./background_messages";
import { createExtensionFeatureService } from "./feature_service";
import { createBrowserPluginInstallation } from "./plugin_installation_service";
import {
  createBrowserPluginCache,
  ensureBrowserPlugin,
} from "./plugin_installation";
import { registerExtensionLifecycle } from "./extension_lifecycle";
import { createWebsiteBridge } from "./website_bridge";
import { createSidePanelAuthHandler } from "./side_panel_auth";
import { createSidePanelMessageHandlers } from "./side_panel_messages";
import { createToolbarStateReporter } from "./toolbar_state";
import { createActionCallout } from "./action_callout";
import { createSidePanelEntrypoints } from "./side_panel_entrypoints";
import { createSidePanelActions } from "./side_panel_actions";
import { createSidePanelWindowController } from "./side_panel_window";
import { createSidePanelTabController } from "./side_panel_tabs";
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
  const actionCallout = createActionCallout(host.chrome);
  let sidePanelWindow:
    ReturnType<typeof createSidePanelWindowController> | undefined;
  let sidePanelTabs:
    ReturnType<typeof createSidePanelTabController> | undefined;
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
    browserInfo: browserFamilies,
    isInternalTab: isBrowserInternalTab,
    isNewTab: isBrowserNewTab,
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
    browserInfo: browserFamilies,
    browserFamily: identifyBrowserFamily,
    buildChannel: extensionBuildChannel,
    getUserTabs: createBrowserTabsReader(host.chrome),
    getUserHistory: createBrowserHistoryReader(host.chrome),
    canAnimateCursor: createCursorAvailability(host.chrome),
    validateTabId: validateBrowserTabId,
    validateMouse: validateBrowserMouse,
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
        isBrowserInternalTab(
          identifyBrowserFamily(
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
  function getSidePanelWindowController(
    dependencies: Omit<
      Parameters<typeof createSidePanelWindowController>[0],
      "chrome" | "tabs" | "clearActionCallout"
    >,
  ) {
    sidePanelTabs ??= createSidePanelTabController({
      chrome: host.chrome,
      isEdge: dependencies.isEdge,
      warn: dependencies.warn,
    });
    return (sidePanelWindow ??= createSidePanelWindowController({
      ...dependencies,
      chrome: host.chrome,
      tabs: sidePanelTabs,
      clearActionCallout: actionCallout.clear,
    }));
  }
  return {
    registerBackgroundKernel<Pdf>(
      dependencies: Omit<Parameters<typeof registerAssembledBackgroundKernel<Pdf>>[0], "runtime">,
    ) {
      return registerAssembledBackgroundKernel({ ...dependencies, runtime: host.chrome.runtime });
    },
    registerKernelConnections(
      connected: Parameters<typeof registerKernelConnections>[1],
      disconnected?: Parameters<typeof registerKernelConnections>[2],
    ) {
      registerKernelConnections(host.chrome.runtime, connected, disconnected);
    },
    registerBackgroundRuntime(
      dependencies: Omit<
        Parameters<typeof registerBackgroundRuntime>[0],
        "chrome" | "ensureLeases" | "initializeInstanceId"
      >,
    ) {
      registerBackgroundRuntime({
        ...dependencies,
        chrome: host.chrome,
        ensureLeases: () => tabLeases.getInstance().ensureInit(),
        initializeInstanceId: instanceId,
      });
    },
    createBackgroundMessageRouter<Control>(
      dependencies: Omit<
        Parameters<typeof createBackgroundMessageRouter<Control>>[0],
        "runtimeId" | "getActiveLease"
      >,
    ) {
      return createBackgroundMessageRouter({
        ...dependencies,
        runtimeId: host.chrome.runtime.id,
        getActiveLease: (tabId) =>
          tabLeases.getInstance().getActiveLease(tabId),
      });
    },
    ChatApi,
    actionCallout,
    createFeatureService(
      dependencies: Pick<
        Parameters<typeof createExtensionFeatureService>[0],
        "buildChannel" | "browserFamily" | "sdkKey" | "api" | "warn" | "Client"
      >,
    ) {
      return createExtensionFeatureService({
        ...dependencies,
        chrome: host.chrome,
        crypto: host.crypto,
        readAuth: siwc.readAuthSession,
        fetch: host.fetch ?? globalThis.fetch,
      });
    },
    createBrowserPluginInstallation(
      dependencies: Pick<
        Parameters<typeof createBrowserPluginInstallation>[0],
        "refreshAuth" | "subscribeGate" | "warn"
      >,
      onInstalled: () => Promise<unknown>,
    ) {
      return createBrowserPluginInstallation(
        {
          ...dependencies,
          cache: createBrowserPluginCache({
            storage: host.chrome.storage.session,
            now: host.now,
          }),
          ChatApi,
          createAuthReader: siwc.createCachedAuthReader,
          now: host.now,
          random: host.random ?? Math.random,
          setTimeout: host.setTimeout,
          clearTimeout: host.clearTimeout,
        },
        onInstalled,
      );
    },
    ensureBrowserPlugin,
    createBrowserPluginCache() {
      return createBrowserPluginCache({
        storage: host.chrome.storage.session,
        now: host.now,
      });
    },
    registerExtensionLifecycle(
      dependencies: Omit<
        Parameters<typeof registerExtensionLifecycle>[0],
        "chrome" | "createAuthReader" | "refreshWebsite"
      > & {
        reportFailure: Parameters<
          typeof createWebsiteBridge
        >[0]["reportFailure"];
      },
      options: Parameters<typeof registerExtensionLifecycle>[1],
    ) {
      const bridge = createWebsiteBridge({
        chrome: host.chrome,
        withTimeout: contentRuntime.withTimeout,
        reportFailure: dependencies.reportFailure,
      });
      return registerExtensionLifecycle(
        {
          ...dependencies,
          chrome: host.chrome,
          createAuthReader: siwc.createCachedAuthReader,
          refreshWebsite: bridge.refresh,
        },
        options,
      );
    },
    createWebsiteBridge(
      reportFailure: Parameters<typeof createWebsiteBridge>[0]["reportFailure"],
    ) {
      return createWebsiteBridge({
        chrome: host.chrome,
        withTimeout: contentRuntime.withTimeout,
        reportFailure,
      });
    },
    createSidePanelAuthHandler(
      workUrl: string | null | undefined,
      onAuthState?: () => void,
    ) {
      return createSidePanelAuthHandler(host, workUrl, onAuthState);
    },
    createSidePanelMessageHandlers(
      dependencies: Omit<
        Parameters<typeof createSidePanelMessageHandlers>[0],
        "runtime" | "getInstanceId"
      >,
    ) {
      return createSidePanelMessageHandlers({
        ...dependencies,
        runtime: host.chrome.runtime,
        getInstanceId: instanceId,
      });
    },
    createToolbarStateReporter(
      dependencies: Pick<
        Parameters<typeof createToolbarStateReporter>[0],
        "reportMetric" | "warn"
      >,
    ) {
      return createToolbarStateReporter({
        ...dependencies,
        chrome: host.chrome,
        now: host.now,
      });
    },
    createSidePanelEntrypoints(
      dependencies: Parameters<typeof getSidePanelWindowController>[0],
    ) {
      const controller = getSidePanelWindowController(dependencies);
      const actions = createSidePanelActions({
        chrome: host.chrome,
        open: controller.open,
        now: host.now,
      });
      return createSidePanelEntrypoints({
        chrome: host.chrome,
        showCallout: actionCallout.show,
        registerWindowEvents: controller.register,
        registerContextMenu: actions.registerContextMenu,
        isOpen: controller.isOpen,
        toggle: controller.toggle,
        reportOpen: (source) => {
          dependencies
            .reportOpen(source)
            .catch(() =>
              dependencies.warn(
                "Failed to report Chrome extension sidechat open.",
              ),
            );
        },
      });
    },
    getSidePanelWindowController,
    createSidePanelActions(
      dependencies: Parameters<typeof getSidePanelWindowController>[0],
    ) {
      const controller = getSidePanelWindowController(dependencies);
      return createSidePanelActions({
        chrome: host.chrome,
        open: controller.open,
        now: host.now,
      });
    },
    getSidePanelTabController(
      isEdge: () => boolean,
      warn: (message: string) => void,
    ) {
      return (sidePanelTabs ??= createSidePanelTabController({
        chrome: host.chrome,
        isEdge,
        warn,
      }));
    },
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
