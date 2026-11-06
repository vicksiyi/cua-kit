import {
  createExtensionBrowserFoundation,
  type ExtensionBrowserHost,
} from "./browser_foundation";
import {
  startExtensionBackground,
  type BackgroundStartupHost,
} from "./background_startup";
import { createNativeTransportClass } from "./native_transport";
import { ExtensionBrowserPeer } from "./browser_peer";
import {
  createKernelControlClass,
  KernelControlPeer,
  type KernelControlHost,
} from "./kernel_control";
import {
  browserFamilies,
  extensionBuildChannel,
  identifyBrowserFamily,
} from "./browser_platform";

type Foundation = ReturnType<typeof createExtensionBrowserFoundation>;
/** Production environment boundaries remain explicit: credentials are obtained by
 * restored auth services; the caller supplies feature configuration and kernel/PDF runtime.
 */
export type BackgroundKernelBindings<Pdf> = Omit<
  KernelControlHost<Pdf>,
  "storage" | "fetch" | "getConfig" | "isEnabled"
> & { registerTurnEnded: BackgroundStartupHost["registerTurnEnded"] };
export interface BackgroundAssemblyOptions<Pdf> {
  host: ExtensionBrowserHost;
  navigator: { userAgent: string; [key: string]: unknown };
  channel: "dev" | "internal" | "prod";
  nativeHosts: string[];
  sidePanelEnabled: boolean;
  scope: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  features: Omit<
    Parameters<Foundation["createFeatureService"]>[0],
    "buildChannel" | "browserFamily" | "warn"
  >;
  kernel:
    | BackgroundKernelBindings<Pdf>
    | ((foundation: Foundation) => BackgroundKernelBindings<Pdf>);
  telemetry: {
    initialize(): Promise<unknown>;
    reportError(error: unknown, stage: string): void;
    reportTurnEndedError(error: unknown): void;
  };
  console: Pick<Console, "warn" | "error">;
}
/** Bind the original startup to restored implementations, without fake feature/auth services.
 * This is deliberately separate from selecting/packaging a full extension deployment.
 */
export function createExtensionBackground<Pdf>(
  options: BackgroundAssemblyOptions<Pdf>,
) {
  const foundation = createExtensionBrowserFoundation(options.host);
  const kernel =
    typeof options.kernel === "function"
      ? options.kernel(foundation)
      : options.kernel;
  const family = identifyBrowserFamily(
    options.navigator.userAgent,
    "brave" in options.navigator,
  );
  const channel = extensionBuildChannel(options.channel);
  const warn = (message: string) => options.console.warn(message);
  const features = foundation.createFeatureService({
    ...options.features,
    buildChannel: () => channel,
    browserFamily: family,
    warn,
  });
  const website = foundation.createWebsiteBridge(features.bufferMetric);
  const toolbar = foundation.createToolbarStateReporter({
    reportMetric: features.reportMetric,
    warn,
  });
  const panelDependencies = {
    isEdge: () => family === "edge",
    browserName: () => browserFamilies[family].displayName,
    reportOpen: (source: string) =>
      features.reportMetric("codex_chrome_extension_sidechat_open", 1, {
        destination: "work_sidepanel",
        source,
      }),
    warn,
  };
  const panelMessages = foundation.createSidePanelMessageHandlers({
    userAgent: options.navigator.userAgent,
    reportMetric: features.reportMetric,
    reportFailure: features.bufferMetric,
  });
  const panelActions = foundation.createSidePanelActions(panelDependencies);
  const statusPort = foundation.createWebsiteStatusHandler(
    features.bufferMetric,
  );
  const Handler = foundation.createHandlerClass(
    { navigator: options.navigator },
    { metric: features.bufferMetric, warn },
  );
  const Transport = createNativeTransportClass(options.host);
  const Control = createKernelControlClass({
    ...kernel,
    storage: options.host.chrome.storage.session,
    fetch: options.host.fetch ?? globalThis.fetch,
    isEnabled: features.checkGate,
    getConfig: async (name) => {
      const config = await features.getDynamicConfig(name);
      return config
        ? { get: (key: string, fallback: unknown) => config.get(key, fallback) }
        : undefined;
    },
  });
  const startup: BackgroundStartupHost = {
    chrome: options.host.chrome,
    buildChannel: () => channel,
    nativeHosts: () => options.nativeHosts,
    sidePanelEnabled: () => options.sidePanelEnabled,
    createInstallation: (onInstalled) =>
      foundation.createBrowserPluginInstallation(
        {
          refreshAuth: features.refreshAuth,
          subscribeGate: features.subscribeGate,
          warn,
        },
        onInstalled,
      ),
    refreshWebsite: website.refresh,
    clearActionCallout: foundation.actionCallout.setBadge,
    createUpdates: () => foundation.extensionUpdates,
    isControlActive: () => foundation.overlay.isBrowserControlActive(),
    onControlActivity: (callback) =>
      foundation.overlay.setBrowserControlActivityChangeHandler(callback),
    createMentionProvider: (build, observe) =>
      new foundation.TabMentionProvider(
        build,
        foundation.tabFavicons.getInstance(),
        observe,
      ),
    observeMentionInvalidations: foundation.observeMentionInvalidations,
    createHandler: (config) => new Handler(config),
    createWebMcpConfig: () =>
      foundation.createWebMcpConfig({
        subscribeGate: features.subscribeGate,
        warn,
      }),
    isEnabled: features.checkGate,
    observeGate: features.subscribeGate,
    registerKernelConnections: foundation.registerKernelConnections,
    createControl: (id) => new Control(id),
    createControlPeer: (transport, control) =>
      new KernelControlPeer(transport, control as InstanceType<typeof Control>),
    createBrowserPeer: (transport, handler) =>
      new ExtensionBrowserPeer(
        transport,
        handler as InstanceType<typeof Handler>,
      ),
    registerTurnEnded: kernel.registerTurnEnded,
    reportTurnEndedError: options.telemetry.reportTurnEndedError,
    createNativeTransport: (hosts) => new Transport(hosts),
    registerToolbarState: toolbar.register,
    registerSidePanelEntrypoints: () =>
      foundation.createSidePanelEntrypoints(panelDependencies).register(),
    registerSidePanelTabs: () =>
      foundation
        .getSidePanelTabController(panelDependencies.isEdge, warn)
        .register(),
    createSidePanelAuth: foundation.createSidePanelAuthHandler,
    refreshAuth: () => features.refreshAuth(),
    ensureLeases: () => foundation.tabLeases.getInstance().ensureInit(),
    getLease: (id) => foundation.tabLeases.getInstance().getActiveLease(id),
    tabMentionPort: (provider, build, port) =>
      foundation
        .createTabMentionMessageRouter(
          provider as InstanceType<typeof foundation.TabMentionProvider>,
          build,
        )
        .handleConnect(port),
    nativeStatusPort: (transport, version, build, port) =>
      statusPort(
        transport as InstanceType<typeof Transport>,
        version,
        build,
        port,
      ),
    sidePanelInstance: panelMessages.instanceId,
    refreshBrowserSettings: (control) =>
      Control.refreshBrowserSettings(control as InstanceType<typeof Control>),
    tabMentionMessage: (provider, build, ...args) =>
      foundation
        .createTabMentionMessageRouter(
          provider as InstanceType<typeof foundation.TabMentionProvider>,
          build,
        )
        .handleMessage(...args),
    youtubeTimestamp: foundation.createYoutubeTimestampHandler(),
    showInstaller: foundation.installerStatus.handleShow,
    sidePanelLoad: panelMessages.loadEvent,
    openSidePanel: panelActions.handleWebsiteOpen,
    cursor: (handler, ...args) =>
      foundation.createCursorMessageHandler(
        handler as InstanceType<typeof Handler>,
      )(...args),
    initializeInstanceId: foundation.instanceId,
    registerLifecycle: (config) =>
      foundation.registerExtensionLifecycle(
        {
          scope: options.scope,
          browserFamily: () => family,
          refreshAuth: features.refreshAuth,
          reportToolbar: toolbar.report,
          registerContextMenu: panelActions.createContextMenu,
          reportMetric: features.reportMetric,
          warn,
          reportFailure: features.bufferMetric,
        },
        config as Parameters<Foundation["registerExtensionLifecycle"]>[1],
      ),
    initializeObservedTabs: () => foundation.observedTabs.initialize(),
    registerHeartbeat: (...pings) =>
      foundation.registerClientHeartbeat(
        {
          reportError: options.telemetry.reportError,
          console: options.console,
          reportMetric: features.bufferMetric,
        },
        ...pings,
      ),
    reportError: options.telemetry.reportError,
    console: options.console,
  };
  return {
    foundation,
    features,
    startup,
    start: async () => {
      await options.telemetry.initialize();
      return startExtensionBackground(startup);
    },
  };
}
