import { createRequestHeaderPolicyClass } from "./request_headers";
import { validateCdpCommand, filterCdpResult } from "./cdp_security";
/** Dependencies of original pE, kept explicit until their production implementations are restored.
 * No permissive fallback: callers must supply the original session/security/capability contracts.
 */
export interface BrowserCommandDependencies {
  chrome: typeof chrome;
  navigator: { userAgent: string; [name: string]: unknown };
  browserFamily(userAgent: string, brave: boolean): string;
  tabLeases: { getInstance(): any };
  Siwc: new (activate: (request: any) => Promise<any>) => any;
  buildChannel(value: string): any;
  favicons: { getInstance(): any };
  TabMentionProvider: new (channel: any, favicons: any) => any;
  initializeDebugger(): void;
  initializeForeignExtensionFrameMonitor(): void;
  initializePopupInterceptor(): void;
  networkPolicy: { getInstance(): any };
  getTab(tabId: number): Promise<any>;
  getUserTabs(): Promise<any[]>;
  getUserHistory(request: any): Promise<any>;
  validateTabId(method: string, tabId: any): void;
  executeTabRead(request: any): Promise<any>;
  getTabContext(
    execute: (func: any, args: any, world: any) => Promise<any>,
  ): Promise<any>;
  browserInfo: Record<string, { shortDisplayName: string }>;
  dispatchCommand(request: any): Promise<any>;
  commandSets: [any, any];
  commandNames: {
    management: string;
    audit: string;
    setViewport: string;
    resetViewport: string;
  };
  schemas: Record<
    | "managementInput"
    | "managementOutput"
    | "auditInput"
    | "auditOutput"
    | "viewportInput"
    | "viewportOutput"
    | "resetInput"
    | "resetOutput",
    { parse(value: any): any }
  >;
  validateMouse(method: string, request: any): void;
  overlay: {
    isObserved(tabId: number): boolean;
    isBrowserControlActive(): boolean;
    setCursorState(...args: any[]): Promise<any>;
  };
  canAnimateCursor(tabId: number): Promise<boolean>;
  Session: new (id: string, family: string, popup: any, headers: any) => any;
  instanceId(): Promise<string>;
  capabilities: {
    browser: any;
    management: any;
    pageAssets: any;
    tab: any;
    webMcp: any;
  };
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}
export interface BrowserCommandOptions {
  agentPopupInterceptorEnabled?: any;
  buildChannel?: any;
  browserManagementEnabled?: Promise<boolean>;
  browserTabMentionProvider?: any;
  webMcpConfig?: { enabled(): Promise<boolean> };
}
const cursorKey = (session: string, turn: string, sequence: number) =>
  `${session}:${turn}:${sequence}`;
export function createBrowserCommandHandlerClass(
  deps: BrowserCommandDependencies,
) {
  const { chrome } = deps;
  const RequestHeaderPolicy = createRequestHeaderPolicyClass(chrome);
  return class BrowserCommandHandler {
    browserFamily = deps.browserFamily(
      deps.navigator.userAgent,
      "brave" in deps.navigator,
    );
    sessions = new Map<string, any>();
    tabLeases = deps.tabLeases.getInstance();
    requestHeaderPolicy = new RequestHeaderPolicy();
    agentPopupInterceptorEnabled: any;
    browserManagementEnabled: Promise<boolean>;
    webMcpConfig: BrowserCommandOptions["webMcpConfig"];
    browserTabMentionProvider: any;
    cursorArrivalWaitersByKey = new Map<string, () => void>();
    downloadChangeListeners = new Set<(event: any) => void>();
    downloadFilenamesById = new Map<number, string>();
    downloadUrlsById = new Map<number, string>();
    siwc = new deps.Siwc((request) => this.activateSession(request));
    nextCursorMoveSequence = 1;
    constructor({
      agentPopupInterceptorEnabled,
      buildChannel = deps.buildChannel("prod"),
      browserManagementEnabled,
      browserTabMentionProvider,
      webMcpConfig,
    }: BrowserCommandOptions = {}) {
      this.agentPopupInterceptorEnabled = agentPopupInterceptorEnabled;
      this.browserManagementEnabled =
        browserManagementEnabled ?? Promise.resolve(true);
      this.webMcpConfig = webMcpConfig;
      const favicons = deps.favicons.getInstance();
      this.browserTabMentionProvider =
        browserTabMentionProvider ??
        new deps.TabMentionProvider(buildChannel, favicons);
      deps.initializeDebugger();
      deps.initializeForeignExtensionFrameMonitor();
      deps.initializePopupInterceptor();
      deps.networkPolicy.getInstance();
    }
    ping() {
      return "pong";
    }
    async focusTab(request: any) {
      if (!Number.isSafeInteger(request.tabId) || request.tabId <= 0)
        throw new Error("focusTab requires a positive integer tabId");
      if (
        request.session_id != null &&
        !this.sessions.has(this.requireSessionId(request))
      )
        return false;
      const tab = await deps.getTab(request.tabId);
      await Promise.all([
        chrome.tabs.update(request.tabId, { active: true }),
        chrome.windows.update(tab.windowId, { focused: true }),
      ]);
      return request.session_id == null ? undefined : true;
    }
    async executeCdp(request: any) {
      validateCdpCommand(request.method, request.commandParams);
      const session = await this.activateSession(request);
      return filterCdpResult(request.method, await session.executeCdp(request));
    }
    async attach(request: any) {
      await this.resolveSession(request).attach(request);
    }
    async attachTarget(request: any) {
      await this.resolveSession(request).attachTarget(request);
    }
    async detach(request: any) {
      await this.resolveSession(request).detach(request);
    }
    async detachTarget(request: any) {
      await this.resolveSession(request).detachTarget(request);
    }
    async attachBrowserUseNetworkPolicy(request: any) {
      await this.resolveSession(request).attachBrowserUseNetworkPolicy(
        request.tabId,
        request.policy,
      );
    }
    async detachBrowserUseNetworkPolicy(request: any) {
      await this.resolveSession(request).detachBrowserUseNetworkPolicy(
        request.tabId,
      );
    }
    async getCommittedTabUrl(request: any) {
      return await (
        await this.activateSession(request)
      ).getCommittedTabUrl(request.tabId);
    }
    getSiwcAccountContext(request: any) {
      return this.siwc.getSiwcAccountContext(request);
    }
    issueSiwcBrowserGrant(request: any) {
      return this.siwc.issueSiwcBrowserGrant(request);
    }
    installSiwcBrowserGrantCookie(request: any) {
      return this.siwc.installSiwcBrowserGrantCookie(request);
    }
    async getTabs(request: any) {
      const tabs = await (await this.activateSession(request)).getTabs();
      return await Promise.all(
        tabs.map(async (tab: any) => ({
          ...tab,
          providerTabId: await this.browserTabMentionProvider.getProviderTabId(
            tab.id,
          ),
        })),
      );
    }
    async getUserTabs(request: any) {
      if (
        request.includeFavicons !== undefined ||
        request.limit !== undefined ||
        request.query !== undefined
      )
        return await this.browserTabMentionProvider.getUserTabs(request);
      const tabs = await deps.getUserTabs();
      return await Promise.all(
        tabs.map(async (tab) => ({
          ...tab,
          providerTabId: await this.browserTabMentionProvider.getProviderTabId(
            tab.id,
          ),
        })),
      );
    }
    async getUserHistory(request: any) {
      await this.activateSession(request);
      return await deps.getUserHistory(request);
    }
    async executeTabRead(request: any) {
      deps.validateTabId("executeTabRead", request.tabId);
      return await this.resolveSession(request).runPassiveRead(request, () =>
        deps.executeTabRead(request),
      );
    }
    async getTabContext(request: any) {
      if (request.tabId !== undefined)
        deps.validateTabId("getTabContext", request.tabId);
      return await this.resolveSession(request).runPassiveRead(
        request,
        async () => {
          const tab =
            request.tabId === undefined
              ? (
                  await chrome.tabs.query({
                    active: true,
                    lastFocusedWindow: true,
                  })
                )[0]
              : await chrome.tabs.get(request.tabId);
          if (tab?.id == null || tab.incognito === true)
            throw new Error("No readable browser tab is available");
          const tabId = tab.id;
          return {
            ...(await deps.getTabContext(async (func, args, world) => {
              const [result] = await chrome.scripting.executeScript({
                args,
                func,
                target: { tabId },
                world,
              });
              return result?.result;
            })),
            tabId,
          };
        },
      );
    }
    async getBookmarks(request: any) {
      await this.activateSession(request);
      return await chrome.bookmarks.getTree();
    }
    async createNotification(request: any) {
      await this.activateSession(request);
      return await chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("/images/icon128.png"),
        title: request.title,
        message: request.message,
      });
    }
    async getRecentlyClosedSessions(request: any) {
      await this.activateSession(request);
      return await chrome.sessions.getRecentlyClosed();
    }
    async getTopSites(request: any) {
      await this.activateSession(request);
      return await chrome.topSites.get();
    }
    async claimUserTab(request: any) {
      return await this.resolveSession(request).claimUserTab(
        request,
        request.tabId,
      );
    }
    async createTab(request: any) {
      const session = this.resolveSession(request);
      const windowId =
        typeof request.preferredWindowId === "number" &&
        Number.isSafeInteger(request.preferredWindowId) &&
        request.preferredWindowId >= 0
          ? request.preferredWindowId
          : undefined;
      return await session.createTab(request, windowId);
    }
    async markTab(request: any) {
      await this.resolveSession(request).markTab(
        request,
        request.tabId,
        request.status,
      );
    }
    async finalizeTabs(request: any) {
      const session = this.resolveSession(request);
      if (!Array.isArray(request.keep))
        throw new Error("finalizeTabs requires a keep array");
      await session.finalizeTabs(request, request.keep);
    }
    async nameSession(request: any) {
      await this.resolveSession(request).nameSession(request, request.name);
    }
    async executeUnhandledCommand(request: any) {
      const session = await this.activateSession(request),
        turn = this.requireTurnId(request);
      const { schemas, commandNames } = deps;
      return await deps.dispatchCommand({
        backendName: deps.browserInfo[this.browserFamily].shortDisplayName,
        commandSets: deps.commandSets,
        handlers: {
          [commandNames.management]: async (payload: any) => {
            if (!(await this.browserManagementEnabled))
              throw new Error("Browser management capability is disabled");
            const input = schemas.managementInput.parse(payload);
            return schemas.managementOutput.parse({
              value: await session.executeBrowserManagementCall(turn, input),
            });
          },
          [commandNames.audit]: async (payload: any) => {
            if (!(await this.browserManagementEnabled))
              throw new Error("Browser management capability is disabled");
            schemas.auditInput.parse(payload);
            return schemas.auditOutput.parse(
              await session.getBrowserManagementAuditTrail(turn),
            );
          },
          [commandNames.setViewport]: async (payload: any) => {
            const input = schemas.viewportInput.parse(payload);
            await session.setViewport(request, {
              height: input.height,
              width: input.width,
            });
            return schemas.viewportOutput.parse({});
          },
          [commandNames.resetViewport]: async (payload: any) => {
            schemas.resetInput.parse(payload);
            await session.setViewport(request, null);
            return schemas.resetOutput.parse({});
          },
        },
        payload: request,
      });
    }
    async moveMouse(request: any) {
      deps.validateMouse("moveMouse", request);
      const observed = deps.overlay.isObserved(request.tabId);
      await (
        await this.activateSession(request)
      ).requireSessionTab(request.tabId, {
        publishOverlay: false,
        trackOverlay: true,
      });
      const sequence = this.nextCursorMoveSequence;
      this.nextCursorMoveSequence += 1;
      const animate =
        request.waitForArrival === false || !observed
          ? false
          : await deps.canAnimateCursor(request.tabId);
      const waiter =
        request.waitForArrival !== false && animate
          ? this.createCursorArrivalWaiter({
              moveSequence: sequence,
              sessionId: request.session_id,
              turnId: request.turn_id,
            })
          : null;
      const applied = await deps.overlay.setCursorState(
        request.session_id,
        request.tabId,
        request.turn_id,
        {
          ...(animate ? {} : { animateMovement: false }),
          moveSequence: sequence,
          visible: true,
          x: request.x,
          y: request.y,
        },
        { publish: observed },
      );
      if (waiter != null) {
        if (!applied) {
          waiter.cancel();
          return;
        }
        await waiter.promise;
      }
    }
    notifyCursorArrived({ moveSequence, sessionId, turnId }: any) {
      if (Number.isInteger(moveSequence))
        this.cursorArrivalWaitersByKey.get(
          cursorKey(sessionId, turnId, moveSequence),
        )?.();
    }
    async turnEnded(request: any) {
      const sessionId = this.requireSessionId(request),
        turnId = this.requireTurnId(request);
      let session = this.sessions.get(sessionId);
      if (!session) {
        session = new deps.Session(
          sessionId,
          this.browserFamily,
          this.agentPopupInterceptorEnabled,
          this.requestHeaderPolicy,
        );
        this.sessions.set(sessionId, session);
      }
      await session.endTurn(turnId);
    }
    async getInfo(_request: any) {
      const instanceId = await deps.instanceId();
      return {
        browserTabMentions:
          await this.browserTabMentionProvider.getCapabilityInfo(),
        family: this.browserFamily,
        name: deps.browserInfo[this.browserFamily].shortDisplayName,
        version:
          typeof (chrome.runtime as any).getVersion === "function"
            ? (chrome.runtime as any).getVersion()
            : "unknown",
        type: "extension",
        apiSupportOverrides: { "BrowserUser.getTabContext": true },
        agentRequestHeaderEnabled: await this.requestHeaderPolicy.isEnabled(),
        requestHeadersVersion: 1,
        capabilities: {
          browser: [
            deps.capabilities.browser,
            ...((await this.browserManagementEnabled)
              ? [deps.capabilities.management]
              : []),
          ],
          tab: [
            deps.capabilities.pageAssets,
            deps.capabilities.tab,
            ...((await this.webMcpConfig?.enabled())
              ? [deps.capabilities.webMcp]
              : []),
          ],
        },
        metadata: {
          extensionId: chrome.runtime.id,
          extensionInstanceId: instanceId,
        },
      };
    }
    addDownloadChangeListener(listener: (event: any) => void) {
      this.downloadChangeListeners.add(listener);
      return () => {
        this.downloadChangeListeners.delete(listener);
      };
    }
    handleDownloadCreated(download: any) {
      if (
        validDownloadId(download.id) &&
        deps.overlay.isBrowserControlActive() &&
        typeof download.filename === "string"
      ) {
        this.downloadFilenamesById.set(download.id, download.filename);
        this.downloadUrlsById.set(download.id, download.finalUrl);
        this.emitDownloadChange({
          id: String(download.id),
          filename: download.filename,
          url: download.finalUrl,
          status: "started",
        });
      }
    }
    handleDownloadChanged(change: any) {
      if (!validDownloadId(change.id)) return;
      const filename = downloadFilename(change, this.downloadFilenamesById);
      if (filename == null) return;
      const url = this.downloadUrlsById.get(change.id);
      if (url == null) return;
      this.downloadFilenamesById.set(change.id, filename);
      const status = downloadStatus(change);
      if (status != null)
        this.emitDownloadChange({
          id: String(change.id),
          filename,
          url,
          status,
        });
    }
    async handleCreatedNavigationTarget(event: any) {
      const lease = await this.tabLeases.getActiveLease(event.sourceTabId);
      if (lease == null) return;
      const session = this.sessions.get(lease.sessionId);
      if (session != null) await session.claimChildTab(lease, event.tabId);
    }
    async handleAgentBackgroundPopup(tabId: number, url: string) {
      const lease = await this.tabLeases.getActiveLease(tabId);
      if (lease == null) return;
      const session = this.sessions.get(lease.sessionId);
      if (session == null || session.currentTurnId !== lease.turnId) return;
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
      const source = await deps.getTab(tabId);
      const tab = await chrome.tabs.create({
        active: false,
        openerTabId: tabId,
        url: "about:blank",
        windowId: source.windowId,
      });
      if (tab.id != null)
        try {
          await session.claimChildTab(lease, tab.id, { logicalActive: true });
          if ((await this.tabLeases.getActiveLease(tab.id)) == null)
            await chrome.tabs.remove(tab.id).catch(() => {});
          else await chrome.tabs.update(tab.id, { url: parsed.href });
        } catch (error) {
          await chrome.tabs.remove(tab.id).catch(() => {});
          throw error;
        }
    }
    resolveSession(request: any) {
      const id = this.requireSessionId(request);
      this.requireTurnId(request);
      let session = this.sessions.get(id);
      if (request.session_context === "cached") {
        if (!session) throw new Error(`Browser session ${id} is not active`);
        session.requireActiveTurn(this.requireTurnId(request));
        return session;
      }
      if (!session) {
        session = new deps.Session(
          id,
          this.browserFamily,
          this.agentPopupInterceptorEnabled,
          this.requestHeaderPolicy,
        );
        this.sessions.set(id, session);
      }
      return session;
    }
    async activateSession(request: any) {
      const session = this.resolveSession(request);
      await session.activateTurn(request);
      return session;
    }
    requireSessionId(request: any): string {
      const id = request?.session_id;
      if (typeof id !== "string")
        throw new Error("Missing required browser session_id");
      return id;
    }
    requireTurnId(request: any): string {
      const id = request?.turn_id;
      if (typeof id !== "string")
        throw new Error("Missing required browser turn_id");
      return id;
    }
    createCursorArrivalWaiter({ moveSequence, sessionId, turnId }: any) {
      const key = cursorKey(sessionId, turnId, moveSequence);
      let timer: ReturnType<typeof setTimeout> | null = null;
      let resolve: (() => void) | null = null;
      const cancel = () => {
        if (timer != null) {
          deps.clearTimeout(timer);
          timer = null;
        }
        this.cursorArrivalWaitersByKey.delete(key);
        resolve?.();
      };
      return {
        cancel,
        promise: new Promise<void>((done) => {
          resolve = done;
          timer = deps.setTimeout(cancel, 1500);
          this.cursorArrivalWaitersByKey.set(key, cancel);
        }),
      };
    }
    emitDownloadChange(event: any) {
      for (const listener of this.downloadChangeListeners) listener(event);
    }
  };
}
function validDownloadId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0;
}
function downloadFilename(change: any, filenames: Map<number, string>) {
  const current = change.filename?.current;
  return typeof current === "string" ? current : filenames.get(change.id);
}
function downloadStatus(change: any) {
  switch (change.state?.current) {
    case "complete":
      return "complete";
    case "interrupted":
      return change.error?.current === "USER_CANCELED" ? "canceled" : "failed";
    case "in_progress":
      return "in_progress";
    case undefined:
      return;
  }
}
