/** Browser service context (original ob). Host constructors are explicit until production assembly is restored. */
type ServiceConstructor = new (...args: any[]) => any;
export interface BrowserContextDependencies {
  Preferences: ServiceConstructor;
  Cdp: ServiceConstructor;
  Clipboard: ServiceConstructor;
  BrowserUser: ServiceConstructor;
  Ui: ServiceConstructor;
  Cua: ServiceConstructor;
  Dev: ServiceConstructor;
  Tabs: ServiceConstructor;
  TabLifecycle: ServiceConstructor;
  Playwright: ServiceConstructor;
  Security: ServiceConstructor;
  DocumentResponses: ServiceConstructor;
  Downloads: ServiceConstructor;
  SiteInstructions: ServiceConstructor;
  PageAssets: ServiceConstructor;
  Accessibility: ServiceConstructor;
  AccessibilityActions: ServiceConstructor;
  credentialObservationGate(browserId: string, cdp: any): any;
  canObserve(context: any): boolean;
  disabledCapabilities(runtime: any): Set<string>;
  createLocalizer(locale?: string): (...args: any[]) => any;
  clearWebMcpSessions(context: any): void;
}
export interface BrowserContextOptions {
  runtime: any;
  commandTiming: any;
  filesystem: any;
  environment: string;
  performanceSpan: any;
  config: any;
  elicitationDisplayName: string;
  preferredWindowId?: number;
}
export function createBrowserContextClass(deps: BrowserContextDependencies) {
  return class BrowserContext {
    api: any;
    browserId: string;
    clientInfo: any;
    ax: any;
    cdp: any;
    clipboard: any;
    credentialObservationGate: any;
    finishNativeCredentialModelCommand: any;
    finishDownloadSetup = () => {};
    browserUser: any;
    isIabBackend: boolean;
    cua: any;
    dev: any;
    documentResponses: any;
    downloads: any;
    filesystem: any;
    environment: string;
    pageAssets: any;
    tabs: any;
    tabLifecycle: any;
    playwright: any;
    commandTiming: any;
    performanceSpan: any;
    preferences: any;
    runtime: any;
    ui: any;
    security: any;
    siteInstructions: any;
    elicitationDisplayName: string;
    removeCloseListener: () => void;
    removeTabAttachHandler?: () => void;
    removeCredentialNavigationListeners: () => void;
    disposePromise?: Promise<void>;
    transportClosed = false;
    cachedLocalizer?: { locale?: string; localize: (...args: any[]) => any };
    constructor(
      api: any,
      browserId: string,
      clientInfo: any,
      options: BrowserContextOptions,
    ) {
      this.api = api;
      this.browserId = browserId;
      this.clientInfo = clientInfo;
      this.runtime = options.runtime;
      this.commandTiming = options.commandTiming;
      this.filesystem = options.filesystem;
      this.environment = options.environment;
      this.performanceSpan = options.performanceSpan;
      this.preferences = new deps.Preferences(options.config, this.runtime);
      this.elicitationDisplayName = options.elicitationDisplayName;
      this.isIabBackend = clientInfo.type === "iab";
      this.cdp = new deps.Cdp(
        api,
        this.runtime.platform,
        this.performanceSpan,
        async () =>
          clientInfo.type === "iab" || clientInfo.type === "extension"
            ? this.preferences.getNetworkPolicy()
            : { constraints: [] },
      );
      this.credentialObservationGate = deps.credentialObservationGate(
        browserId,
        this.cdp,
      );
      this.removeCredentialNavigationListeners =
        this.credentialObservationGate.bindNavigationEvents(this.cdp);
      this.clipboard = new deps.Clipboard();
      this.browserUser = new deps.BrowserUser(
        api,
        this.runtime.captureTabPdfToLibrary,
      );
      this.ui = new deps.Ui(api);
      this.cua = new deps.Cua(
        this.cdp,
        this.ui,
        this.isIabBackend ? "mouseWheel" : "synthesizeScrollGesture",
        this.isIabBackend,
      );
      this.dev = new deps.Dev(this.cdp);
      this.tabs = new deps.Tabs(api, options.preferredWindowId);
      this.tabLifecycle = new deps.TabLifecycle(api);
      this.removeTabAttachHandler = this.isIabBackend
        ? this.cdp.addTabAttachHandler((tab: any) =>
            this.tabLifecycle.recordAcquired(tab),
          )
        : undefined;
      this.playwright = new deps.Playwright(
        this.cdp,
        this.cua,
        this.performanceSpan,
        this.commandTiming,
        this.isIabBackend,
        clientInfo.executionPolicy,
      );
      this.security = new deps.Security(
        {
          get: async (tab: any) => ({ url: await api.getCommittedTabUrl(tab) }),
        },
        clientInfo.type,
        this.preferences,
        this.runtime,
        this.commandTiming,
        (key: any, args: any) => this.localize(key, args),
        {
          elicitationDisplayName: options.elicitationDisplayName,
          browserFamily: clientInfo.family,
        },
        this.browserUser,
      );
      this.documentResponses = new deps.DocumentResponses(this.cdp);
      this.downloads = new deps.Downloads(
        api,
        this.documentResponses,
        this.security,
        clientInfo.type,
      );
      this.siteInstructions = new deps.SiteInstructions(
        clientInfo.type === "cdp" &&
          this.runtime.gaas != null &&
          !!(
            this.runtime.env.OPERATOR_PROXY_URL || this.runtime.env.HTTP_PROXY
          ),
      );
      this.cdp.on("event", (event: any) => {
        if (
          event.method === "Page.frameStartedLoading" &&
          typeof event.source.tabId === "number"
        )
          this.siteInstructions.clearFrame(
            event.source.tabId,
            event.params.frameId,
          );
      });
      this.documentResponses.on("response", (tab: any, response: any) => {
        this.siteInstructions.capture(tab, response);
      });
      this.documentResponses.on("tabDetached", (tab: any) => {
        this.siteInstructions.clear(tab);
      });
      this.pageAssets = new deps.PageAssets(
        this.cdp,
        this.security,
        this.runtime,
        this.filesystem,
        clientInfo,
      );
      this.ax = new deps.Accessibility(
        this.cdp,
        () => this.getCurrentSessionId(),
        new deps.AccessibilityActions(this),
        {
          performanceSpan: this.performanceSpan,
          getTab: (tab: any) => this.tabs.get(tab),
          getSiteInstruction: (tab: any, frame: any) =>
            deps.canObserve(this)
              ? this.siteInstructions.peek(tab, frame)
              : undefined,
          observeNavigations:
            (clientInfo.type === "iab" || clientInfo.type === "extension") &&
            clientInfo.apiSupportOverrides?.["Tab.ax"] === true &&
            !deps.disabledCapabilities(this.runtime).has("Tab.ax"),
        },
      );
      this.removeCloseListener = api.addCloseListener(() => {
        this.transportClosed = true;
        return this.dispose();
      });
      api.detachTurn = async (shouldDetach: () => boolean) => {
        await this.clipboard.cleanupPageClipboards();
        if (shouldDetach()) {
          deps.clearWebMcpSessions(this);
          await this.cdp.detachAllTabs("turnEnded");
        }
      };
    }
    get localize() {
      const value = this.runtime.requestMeta?.["openai/locale"];
      const locale = typeof value === "string" ? value : undefined;
      if (!this.cachedLocalizer || this.cachedLocalizer.locale !== locale)
        this.cachedLocalizer = {
          locale,
          localize: deps.createLocalizer(locale),
        };
      return this.cachedLocalizer.localize;
    }
    acquireAuthority(input: any) {
      return this.security.createAuthorityBuilder(input);
    }
    async history(input: any) {
      return await this.api.getUserHistory(input);
    }
    /** Current installed context: cloud identity is supplied only for CDP. */
    get cloudSiwcUserId() {
      return this.clientInfo.type === "cdp"
        ? this.runtime.gaas?.browserConfig.user_id ?? undefined
        : undefined;
    }
    getSiwcAccountContext(tabId: any) {
      return this.api.sendSessionRequest("getSiwcAccountContext", {
        tabId,
        cloudUserId: this.cloudSiwcUserId,
      });
    }
    issueSiwcBrowserGrant(tabId: any, expectedAccount: any) {
      return this.api.sendSessionRequest("issueSiwcBrowserGrant", {
        tabId,
        expectedAccount,
        cloudUserId: this.cloudSiwcUserId,
      });
    }
    installSiwcBrowserGrantCookie(tabId: any, expectedAccount: any, grant: any) {
      return this.api.sendSessionRequest("installSiwcBrowserGrantCookie", {
        tabId,
        expectedAccount,
        grant,
        cloudUserId: this.cloudSiwcUserId,
      });
    }
    sendWebMcpToolInvoked(input: any) {
      this.api.sendWebMcpToolInvoked(input);
    }
    async nameSession(name: any) {
      await this.api.nameSession(name);
    }
    getCurrentSessionId() {
      return this.api.getCurrentSessionId();
    }
    async followSessionTab(tab: any, reason = "activity") {
      return this.environment !== "orbit"
        ? false
        : await this.api.followSessionTab(tab, reason);
    }
    async supportsTabCapability(capability: any) {
      return (
        (await this.api.getInfo().catch(() => {}))?.capabilities?.tab?.some(
          ({ id }: any) => id === capability,
        ) === true
      );
    }
    async executeUnhandledCommand(command: any) {
      return await this.api.executeUnhandledCommand(command);
    }
    async dispose() {
      this.disposePromise ??= (async () => {
        this.removeCloseListener();
        this.removeTabAttachHandler?.();
        this.removeCredentialNavigationListeners();
        this.api.detachTurn = undefined;
        await this.clipboard.dispose();
        await this.cdp.detachAllTabs();
        this.ax.dispose();
        if (!this.transportClosed) await this.api.close();
      })();
      await this.disposePromise;
    }
  };
}
