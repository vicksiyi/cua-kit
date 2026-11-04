import { parseRequestHeaders, resolveRequestHeaders } from "./request_headers";
/** Original wd dependencies. Factories are required until the lease/debugger/overlay layers are restored. */
export interface BrowserSessionDependencies {
  chrome: typeof chrome;
  tabGroups: { getInstance(): any };
  tabLeases: { getInstance(): any };
  tabFavicons: { getInstance(): any };
  networkPolicy: { getInstance(): any };
  attachedTabs: Set<number>;
  targetOwners: Map<string, number>;
  overlay: any;
  browserInfo: Record<string, { shortDisplayName: string }>;
  executeBrowserManagement(input: any): Promise<any>;
  getBrowserManagementAuditTrail(): Promise<any>;
  sendCdp(request: any): Promise<any>;
  isCdpTimeout(error: unknown): boolean;
  detachAfterTimeout(tabId: number): Promise<any>;
  attachDebugger(tabId: number, viewport: any): Promise<any>;
  attachDebuggerTarget(tabId: number, targetId: string): Promise<any>;
  detachDebugger(tabId: number): Promise<any>;
  detachDebuggerTarget(targetId: string): Promise<any>;
  runTabOperation<T>(tabId: number, operation: () => Promise<T>): Promise<T>;
  getTab(tabId: number): Promise<any>;
  createTab(windowId?: number): Promise<any>;
  muteBackgroundTab(tabId: number): Promise<any>;
  isNewTab(family: string, url: any): boolean;
  isInternalTab(family: string, url: any): boolean;
  prepareNewTab(tabId: number): Promise<any>;
  tabInfo(tab: any): any;
  removeFrameMonitor(tabId: number): Promise<any>;
  removePopupInterceptor(tabId: number): Promise<any>;
  trackFrameMonitor(tabId: number): void;
  ensureFrameMonitor(tabId: number): Promise<any>;
  trackPopupInterceptor(tabId: number): void;
  ensurePopupInterceptor(tabId: number): Promise<boolean>;
  warn(message: string): void;
  metric(name: string, count: number, tags: any): void;
}
export function createBrowserSessionClass(deps: BrowserSessionDependencies) {
  return class BrowserSession {
    tabGroups = deps.tabGroups.getInstance();
    tabLeases = deps.tabLeases.getInstance();
    tabFavicons = deps.tabFavicons.getInstance();
    activeTabId: number | null = null;
    lifecycleQueue: Promise<unknown> = Promise.resolve();
    currentTurnId: string | null = null;
    endedTurnIds = new Set<string>();
    requestHeaderEnabled: boolean | undefined;
    requestHeaders: Array<{ name: string; value: string }> | undefined;
    declare sessionId: string;
    declare browserFamily: string;
    declare agentPopupInterceptorEnabled: any;
    declare requestHeaderPolicy: {
      applyDecision(enable: boolean): Promise<boolean>;
    };
    constructor(
      sessionId: string,
      browserFamily: string,
      popupEnabled: any,
      requestHeaderPolicy: { applyDecision(enable: boolean): Promise<boolean> },
    ) {
      this.sessionId = sessionId;
      this.browserFamily = browserFamily;
      this.agentPopupInterceptorEnabled = popupEnabled;
      this.requestHeaderPolicy = requestHeaderPolicy;
    }
    async activateTurn(request: any) {
      if (!(
        this.currentTurnId === request.turn_id &&
        request.agent_request_header_enabled === undefined &&
        request.request_headers === undefined
      ))
        await this.runTurnMutation(request, async () => {});
    }
    requireActiveTurn(turnId: string) {
      if (this.currentTurnId !== turnId)
        throw new Error(
          `Browser session ${this.sessionId} turn ${turnId} is not active`,
        );
    }
    async runPassiveRead<T>(request: any, operation: () => Promise<T>) {
      return await this.runLifecycle(async () => {
        if (this.endedTurnIds.has(request.turn_id))
          throw new Error(
            `Browser session ${this.sessionId} turn ${request.turn_id} has ended`,
          );
        if (request.session_context === "cached")
          this.requireActiveTurn(request.turn_id);
        return await operation();
      });
    }
    async executeBrowserManagementCall(turnId: string, input: any) {
      return await this.runLifecycle(async () => {
        this.requireActiveTurn(turnId);
        return await deps.executeBrowserManagement(input);
      });
    }
    async getBrowserManagementAuditTrail(turnId: string) {
      return await this.runLifecycle(async () => {
        this.requireActiveTurn(turnId);
        return await deps.getBrowserManagementAuditTrail();
      });
    }
    async executeCdp(request: any) {
      const tabId = request.target.tabId;
      if (typeof tabId === "number") {
        await this.requireSessionTab(tabId);
        if (!deps.attachedTabs.has(tabId))
          throw new Error("Debugger unattached");
      }
      try {
        if (
          typeof tabId === "number" &&
          request.target.sessionId == null &&
          request.target.targetId == null &&
          (request.method === "Page.close" ||
            request.method === "Target.closeTarget")
        )
          await this.tabFavicons.restoreTabFaviconsBestEffort([tabId]);
        return await deps.sendCdp(request);
      } catch (error) {
        if (deps.isCdpTimeout(error) && request.method === "Page.navigate")
          try {
            await deps.sendCdp({
              target: request.target,
              method: "Page.stopLoading",
              commandParams: {},
              timeoutMs: 1000,
            });
          } catch {}
        if (
          deps.isCdpTimeout(error) &&
          typeof tabId === "number" &&
          request.preserveDebuggerOnTimeout !== true
        )
          await deps.detachAfterTimeout(tabId);
        throw error;
      }
    }
    async attach(request: any) {
      await this.runTurnMutation(request, async () => {
        await this.requireSessionTab(request.tabId);
        await deps.networkPolicy
          .getInstance()
          .attach(request.tabId, request.networkPolicy);
        try {
          await deps.attachDebugger(
            request.tabId,
            await this.tabLeases.takeViewportSizeForAttach(
              this.sessionId,
              request.turn_id,
              request.tabId,
            ),
          );
        } catch (error) {
          this.detachNetworkPolicy(request.tabId);
          throw error;
        }
      });
    }
    async attachTarget(request: any) {
      await this.runTurnMutation(request, async () => {
        await this.requireSessionTab(request.tabId);
        await deps.attachDebuggerTarget(request.tabId, request.targetId);
      });
    }
    async detach(request: any) {
      await this.runLifecycle(async () => {
        if (this.currentTurnId != null) this.requireActiveTurn(request.turn_id);
        await this.requireOwnedTab(request.tabId);
        await deps.detachDebugger(request.tabId);
        this.detachNetworkPolicy(request.tabId);
      });
    }
    detachNetworkPolicy(tabId: number) {
      deps.networkPolicy
        .getInstance()
        .detach(tabId)
        .catch(() => {
          deps.warn("Browser Use network policy detachment failed");
          deps.metric(
            "codex_chrome_extension_network_policy_detach_failed",
            1,
            {},
          );
        });
    }
    async detachTarget(request: any) {
      await this.runLifecycle(async () => {
        if (this.currentTurnId != null) this.requireActiveTurn(request.turn_id);
        await this.requireOwnedTab(request.tabId);
        await deps.detachDebuggerTarget(request.targetId);
      });
    }
    async getCommittedTabUrl(tabId: number) {
      await this.requireOwnedTab(tabId);
      return (await deps.chrome.tabs.get(tabId)).url;
    }
    async attachBrowserUseNetworkPolicy(tabId: number, policy: any) {
      await this.runLifecycle(async () => {
        await this.requireOwnedTab(tabId);
        await deps.runTabOperation(tabId, async () => {
          if (deps.attachedTabs.has(tabId))
            throw new Error(
              "Attach the Browser Use network policy before attaching the browser debugger",
            );
          await deps.networkPolicy.getInstance().attach(tabId, policy);
        });
      });
    }
    async detachBrowserUseNetworkPolicy(tabId: number) {
      await this.runLifecycle(async () => {
        await this.requireOwnedTab(tabId);
        await deps.networkPolicy.getInstance().detach(tabId);
      });
    }
    async getTabs() {
      return await this.listSessionTabs();
    }
    async createTab(request: any, windowId?: number) {
      return await this.runTurnMutation(request, async () => {
        const agentTabs = await this.activeAgentTabIds();
        if (
          agentTabs.length === 0 &&
          windowId == null &&
          this.activeTabId != null
        )
          windowId = (await deps.getTab(this.activeTabId).catch(() => null))
            ?.windowId;
        const tab = await deps.createTab(
          agentTabs.length === 0 ? windowId : undefined,
        );
        this.activeTabId = tab.id;
        await deps.muteBackgroundTab(tab.id);
        await this.tabGroups.ensureAgentTabGroup(
          this.sessionId,
          tab.id,
          agentTabs,
        );
        await this.tabLeases.claimTab(
          this.sessionId,
          request.turn_id,
          tab.id,
          "agent",
          this.requestHeaderEnabled,
          this.requestHeaders,
        );
        await this.requireSessionTab(tab.id, { trackOverlay: true });
        return { ...tab, active: true };
      });
    }
    async claimChildTab(lease: any, tabId: number, options: any = {}) {
      await this.runLifecycle(async () => {
        if (
          this.currentTurnId !== lease.turnId ||
          !(await this.tabLeases.claimTabIfSourceLeaseMatches(lease, tabId))
        )
          return;
        const tab = await deps.getTab(tabId).catch(() => null);
        if (tab == null) return;
        if (tab.active === true || options.logicalActive === true)
          this.activeTabId = tabId;
        const siblings = (await this.activeAgentTabIds()).filter(
          (id) => id !== tabId,
        );
        await Promise.allSettled([
          deps.muteBackgroundTab(tabId),
          this.tabGroups.ensureAgentTabGroup(this.sessionId, tabId, siblings),
          this.requireSessionTab(tabId, { trackOverlay: true }),
        ]);
      });
    }
    async claimUserTab(request: any, tabId: number) {
      return await this.runTurnMutation(request, async () => {
        let tab = await deps.getTab(tabId);
        const owner = await this.tabLeases.getOwningSessionId(tabId);
        if (owner != null && owner !== this.sessionId)
          throw new Error(
            `Tab ${tabId} is already part of browser session ${owner}`,
          );
        if (
          deps.isNewTab(this.browserFamily, tab.url) ||
          deps.isNewTab(this.browserFamily, tab.pendingUrl)
        )
          tab = await deps.prepareNewTab(tabId);
        if (
          deps.isInternalTab(this.browserFamily, tab.url) ||
          deps.isInternalTab(this.browserFamily, tab.pendingUrl)
        )
          throw new Error(
            `${deps.browserInfo[this.browserFamily].shortDisplayName} internal tab ${tabId} cannot be claimed`,
          );
        this.activeTabId = tab.id;
        if (owner !== this.sessionId)
          await this.tabLeases.claimTab(
            this.sessionId,
            request.turn_id,
            tab.id,
            "user",
            this.requestHeaderEnabled,
            this.requestHeaders,
          );
        await this.requireSessionTab(tab.id, { trackOverlay: true });
        return { ...deps.tabInfo(tab), active: true };
      });
    }
    async markTab(request: any, tabId: number, status: any) {
      await this.runTurnMutation(request, async () => {
        validateTabId("markTab", tabId);
        if (status !== "handoff" && status !== "deliverable")
          throw new Error(`markTab received invalid status ${String(status)}`);
        await this.requireSessionTab(tabId);
        await this.tabLeases.setTabMark(
          this.sessionId,
          request.turn_id,
          tabId,
          status,
        );
      });
    }
    async nameSession(request: any, name: string) {
      await this.runTurnMutation(request, async () => {
        await this.tabGroups.setSessionGroupTitle(
          this.sessionId,
          name,
          await this.activeAgentTabIds(),
        );
      });
    }
    async setViewport(request: any, viewport: any) {
      await this.runTurnMutation(request, async () => {
        const tab = (await this.listSessionTabs()).find(
          (entry: any) => entry.active,
        );
        await this.tabLeases.setViewportSize(
          this.sessionId,
          request.turn_id,
          tab?.id ?? null,
          viewport,
        );
        if (tab != null) await deps.attachDebugger(tab.id, viewport);
      });
    }
    async finalizeTabs(request: any, keep: any[]) {
      await this.runLifecycle(async () => {
        await this.activateTurnUnlocked(request);
        const tabs = await this.listSessionTabs();
        const marks = validateFinalizedTabs(
          keep,
          new Set(tabs.map((tab: any) => tab.id)),
        );
        await this.tabLeases.replaceTurnMarks(
          this.sessionId,
          request.turn_id,
          marks,
        );
        await this.endTurnUnlocked(request.turn_id);
      });
    }
    async endTurn(turnId: string) {
      await this.runLifecycle(() => this.endTurnUnlocked(turnId));
    }
    async endTurnUnlocked(turnId: string) {
      this.endedTurnIds.add(turnId);
      if (this.currentTurnId != null && this.currentTurnId !== turnId) return;
      await this.tabLeases.clearPendingViewportSize(this.sessionId, turnId);
      const leases: Map<number, any> =
        await this.tabLeases.getSessionActiveLeases(this.sessionId);
      const current = new Map(
        [...leases].filter(([, lease]) => lease.turnId === turnId),
      );
      const tabs = new Set(
        (await this.listSessionTabs()).map((tab: any) => tab.id),
      );
      const { handoff, deliverable, close, release } = partitionFinalizedTabs(
        [...current.values()].filter((lease) => tabs.has(lease.tabId)),
      );
      const all = [...handoff, ...deliverable, ...close, ...release];
      await deps.overlay.stopSessions([this.sessionId]);
      await Promise.all([
        Promise.all([
          ...deliverable.map(async (id) =>
            this.tabFavicons.markFinalized(id, "deliverable").catch(() => {}),
          ),
          ...handoff.map(async (id) =>
            this.tabFavicons.markFinalized(id, "handoff").catch(() => {}),
          ),
        ]),
        this.detachAttachedDebuggersBestEffort(all).then(() => {
          for (const id of all) this.detachNetworkPolicy(id);
        }),
      ]);
      await Promise.allSettled([
        ...all.map(deps.removeFrameMonitor),
        ...all.map(deps.removePopupInterceptor),
      ]);
      await this.tabGroups.releaseTabsFromManagedGroups(deliverable);
      if (close.length > 0) {
        await this.tabFavicons.closeTabsWithFaviconRestore(close, () =>
          closeTabs(deps.chrome, close),
        );
        await this.tabGroups.refreshManagedGroupsFromChrome();
      }
      await Promise.all(
        all.map(async (id) => deps.overlay.untrackTab(this.sessionId, id)),
      );
      await this.tabLeases.releaseTabs(this.sessionId, [
        ...deliverable,
        ...close,
        ...release,
      ]);
      if (handoff.length > 0)
        await this.tabLeases.handoffTabs(this.sessionId, turnId, handoff, {
          ...(this.activeTabId == null
            ? {}
            : { activeTabId: this.activeTabId }),
        });
      this.activeTabId = null;
      this.currentTurnId = null;
      if (
        [...current.values()].some(
          (lease) => lease.requestHeaderEnabled !== undefined,
        )
      )
        await this.tabLeases.reconcileRequestHeaders();
    }
    async resumeHandoffIfPresent(turnId: string) {
      const leases: Map<number, any> =
        await this.tabLeases.getSessionHandoffLeases(this.sessionId);
      if (leases.size === 0) return;
      const states = await Promise.all(
        [...leases.keys()].map(async (tabId) => {
          try {
            await deps.getTab(tabId);
            return { tabId, state: "reclaimed" };
          } catch {
            return { tabId, state: "stale" };
          }
        }),
      );
      const reclaimed: number[] = [],
        stale: number[] = [];
      for (const state of states)
        (state.state === "reclaimed" ? reclaimed : stale).push(state.tabId);
      if (stale.length > 0)
        await this.tabLeases.releaseTabs(this.sessionId, stale);
      if (reclaimed.length === 0) return;
      const resumed: number[] = await this.tabLeases.resumeHandoffTabs(
        this.sessionId,
        turnId,
        reclaimed,
      );
      if (resumed.length === 0) return;
      const resumedSet = new Set(resumed);
      const active = [...leases.values()].find(
        (lease) =>
          lease.isActiveHandoff === true && resumedSet.has(lease.tabId),
      )?.tabId;
      this.activeTabId = active ?? resumed[0] ?? null;
    }
    async detachAttachedDebuggersBestEffort(tabIds: number[]) {
      const tabs = new Set(tabIds);
      await Promise.allSettled([
        ...[...tabs]
          .filter((id) => deps.attachedTabs.has(id))
          .map(async (id) => deps.detachDebugger(id)),
        ...Array.from(deps.targetOwners.entries())
          .filter(([, owner]) => tabs.has(owner))
          .map(async ([target]) => deps.detachDebuggerTarget(target)),
      ]);
    }
    async listSessionTabs() {
      const tabs = (await this.tabLeases.getSessionTabs(this.sessionId)).filter(
        (tab: any) =>
          tab.id !== undefined &&
          !deps.isInternalTab(this.browserFamily, tab.url),
      );
      return this.tabInfosWithLogicalActive(tabs);
    }
    async activeAgentTabIds(): Promise<number[]> {
      return [
        ...(
          await this.tabLeases.getSessionActiveLeases(this.sessionId)
        ).values(),
      ]
        .filter((lease) => lease.origin === "agent")
        .map((lease) => lease.tabId);
    }
    tabInfosWithLogicalActive(tabs: any[]) {
      const infos = tabs.map(deps.tabInfo),
        active = this.resolveLogicalActiveTabId(infos);
      return active == null
        ? infos
        : infos.map((tab) =>
            tab.active === (tab.id === active)
              ? tab
              : { ...tab, active: tab.id === active },
          );
    }
    resolveLogicalActiveTabId(tabs: any[]) {
      if (tabs.length === 0) return null;
      if (
        this.activeTabId != null &&
        tabs.some((tab) => tab.id === this.activeTabId)
      )
        return this.activeTabId;
      this.activeTabId =
        tabs.find((tab) => tab.active)?.id ?? tabs[0]?.id ?? null;
      return this.activeTabId;
    }
    async requireSessionTab(tabId: number, options: any = {}) {
      await this.requireOwnedTab(tabId);
      const publish =
        options.trackOverlay === true && options.publishOverlay !== false;
      await deps.overlay.startSession(this.sessionId, this.currentTurnId, {
        publishTabs: publish,
      });
      if (options.trackOverlay === true)
        await deps.overlay.trackTab(this.sessionId, tabId, { publish });
      deps.trackFrameMonitor(tabId);
      await Promise.all([
        deps.ensureFrameMonitor(tabId),
        Promise.resolve(
          this.requestHeaderEnabled === true ||
            this.agentPopupInterceptorEnabled,
        ).then(async (enabled) => {
          if (!enabled) return;
          deps.trackPopupInterceptor(tabId);
          const prepared = await deps.ensurePopupInterceptor(tabId);
          if (
            this.requestHeaderEnabled === true &&
            !prepared &&
            (await deps.chrome.tabs.get(tabId)).url !== "about:blank"
          )
            throw new Error(
              "Unable to prepare popup request headers. Retry the browser command.",
            );
        }),
      ]);
    }
    async requireOwnedTab(tabId: number) {
      if (!(await this.tabLeases.isClaimedBySession(this.sessionId, tabId)))
        throw new Error(
          `Tab ${tabId} is not part of browser session ${this.sessionId}`,
        );
    }
    async runLifecycle<T>(operation: () => Promise<T>): Promise<T> {
      const pending = this.lifecycleQueue.then(operation, operation);
      this.lifecycleQueue = pending.then(
        () => {},
        () => {},
      );
      return await pending;
    }
    async runTurnMutation<T>(request: any, operation: () => Promise<T>) {
      return await this.runLifecycle(async () => {
        await this.activateTurnUnlocked(request);
        return await operation();
      });
    }
    async activateTurnUnlocked(request: any) {
      if (request.session_context === "cached")
        this.requireActiveTurn(request.turn_id);
      if (request.request_headers === null) {
        if (
          request.agent_request_header_enabled !== undefined &&
          typeof request.agent_request_header_enabled !== "boolean"
        )
          throw new Error(
            "Invalid agent request-header policy: expected a boolean.",
          );
        const enabled =
          request.agent_request_header_enabled === undefined
            ? false
            : await this.requestHeaderPolicy.applyDecision(
                request.agent_request_header_enabled,
              );
        await this.tabLeases.setSessionRequestHeaders(
          this.sessionId,
          undefined,
          enabled,
        );
        this.requestHeaders = undefined;
        this.requestHeaderEnabled = enabled;
      } else if (request.request_headers !== undefined) {
        const headers = parseRequestHeaders(request.request_headers);
        resolveRequestHeaders(headers, this.sessionId);
        await this.tabLeases.setSessionRequestHeaders(this.sessionId, headers);
        this.requestHeaders = headers;
        this.requestHeaderEnabled = headers.length > 0;
      } else {
        const lease = [
          ...(
            await this.tabLeases.getSessionActiveLeases(this.sessionId)
          ).values(),
          ...(
            await this.tabLeases.getSessionHandoffLeases(this.sessionId)
          ).values(),
        ].find((item) => item.requestHeaders !== undefined);
        if (lease?.requestHeaders !== undefined) {
          this.requestHeaders = lease.requestHeaders;
          this.requestHeaderEnabled = this.requestHeaders!.length > 0;
          await this.tabLeases.setSessionRequestHeaders(
            this.sessionId,
            this.requestHeaders,
          );
        } else if (this.requestHeaders !== undefined) {
          this.requestHeaders = undefined;
          this.requestHeaderEnabled = undefined;
        }
      }
      if (
        request.agent_request_header_enabled !== undefined &&
        request.request_headers !== null &&
        this.requestHeaders === undefined
      ) {
        if (typeof request.agent_request_header_enabled !== "boolean")
          throw new Error(
            "Invalid agent request-header policy: expected a boolean.",
          );
        const enabled = await this.requestHeaderPolicy.applyDecision(
          request.agent_request_header_enabled,
        );
        await this.tabLeases.setSessionRequestHeaderEnabled(
          this.sessionId,
          enabled,
        );
        this.requestHeaderEnabled = enabled;
      }
      const turnId = request.turn_id;
      if (this.currentTurnId !== turnId) {
        await this.resumeHandoffIfPresent(turnId);
        await this.tabLeases.updateActiveSessionTurn(this.sessionId, turnId);
        this.currentTurnId = turnId;
      }
    }
  };
}
function validateTabId(method: string, tabId: number) {
  if (!Number.isInteger(tabId))
    throw new Error(`${method} requires an integer tabId`);
}
function validateFinalizedTabs(keep: any[], known: Set<number>) {
  const marks = new Map<number, string>();
  for (const entry of keep) {
    if (entry == null)
      throw new Error("finalizeTabs received invalid tab entry");
    const { tabId, status } = entry;
    validateTabId("finalizeTabs", tabId);
    if (!known.has(tabId))
      throw new Error(`finalizeTabs cannot keep unknown tab ${tabId}`);
    if (status !== "handoff" && status !== "deliverable")
      throw new Error(`finalizeTabs received invalid status ${String(status)}`);
    if (marks.has(tabId))
      throw new Error(`finalizeTabs received duplicate tab ${tabId}`);
    marks.set(tabId, status);
  }
  return marks;
}
function partitionFinalizedTabs(leases: any[]) {
  const groups: Record<string, number[]> = {
    close: [],
    release: [],
    deliverable: [],
    handoff: [],
  };
  for (const lease of leases)
    groups[lease.mark ?? (lease.origin === "agent" ? "close" : "release")].push(
      lease.tabId,
    );
  return groups;
}
async function closeTabs(chromeApi: typeof chrome, tabIds: number[]) {
  const first = tabIds[0];
  if (first != null) {
    if (tabIds.length === 1) {
      await chromeApi.tabs.remove(first);
      return;
    }
    await chromeApi.tabs.remove([first, ...tabIds.slice(1)]);
  }
}
