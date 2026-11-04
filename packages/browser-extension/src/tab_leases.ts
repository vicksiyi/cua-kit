import {
  parseStoredLeases,
  parsePendingViewports,
  matchesSourceLease,
  type TabLease,
  type ViewportSize,
} from "./lease_codec";
import { resolveRequestHeaders } from "./request_headers";
import {
  createRequestHeaderRulesClass,
  type TabRequestHeaders,
} from "./request_header_rules";
/** Original st/wn. One class factory owns the original singleton lifetime. */
export function createTabLeaseManagerClass(host: {
  chrome: typeof chrome;
  instanceId(): Promise<string>;
  now(): number;
  error(message: string, context: { operation: string }): void;
}) {
  const RequestHeaderRules = createRequestHeaderRulesClass(host);
  return class TabLeaseManager {
    static instance: TabLeaseManager | null = null;
    leases = new Map<number, TabLease>();
    pendingViewportSizes = new Map<
      string,
      { turnId: string; viewportSize: ViewportSize | null }
    >();
    storageKey = "TAB_LEASES";
    storage: Pick<chrome.storage.StorageArea, "get" | "set">;
    requestHeaders = new RequestHeaderRules();
    initializePromise: Promise<void> | null = null;
    mutationQueue: Promise<unknown> = Promise.resolve();
    storageLoaded = false;
    listenersRegistered = false;
    activeTabLeaseChangeHandlers = new Set<(tabIds: number[]) => unknown>();
    handleTabRemoved = (tabId: number) => {
      this.removeTab(tabId);
    };
    handleTabReplaced = (added: number, removed: number) => {
      this.replaceTab(added, removed);
    };
    static getInstance() {
      return (
        TabLeaseManager.instance ||
          (TabLeaseManager.instance = new TabLeaseManager()),
        TabLeaseManager.instance
      );
    }
    constructor(
      storage: Pick<chrome.storage.StorageArea, "get" | "set"> = host.chrome
        .storage.session,
    ) {
      this.storage = storage;
      this.registerEventListeners();
    }
    async ensureInit() {
      this.initializePromise ||= this.loadFromStorage();
      await this.initializePromise;
    }
    async reconcileRequestHeaders() {
      await this.ensureInit();
      const error = await this.mutate(() => false, true);
      if (error != null) throw error;
    }
    async getOwningSessionId(tabId: number) {
      await this.ensureInit();
      await this.waitForPendingMutations();
      const lease = this.leases.get(tabId);
      return lease?.state === "active" ? lease.sessionId : null;
    }
    async getActiveLease(tabId: number) {
      await this.ensureInit();
      await this.waitForPendingMutations();
      const lease = this.leases.get(tabId);
      return lease?.state === "active" ? { ...lease } : null;
    }
    async claimTabIfSourceLeaseMatches(source: TabLease, tabId: number) {
      await this.ensureInit();
      const instanceId = await host.instanceId();
      let claimed = false,
        headerEnabled: boolean | undefined;
      const error = await this.mutate(() => {
        const current = this.leases.get(source.tabId);
        if (
          source.state !== "active" ||
          current == null ||
          !matchesSourceLease(current, source) ||
          this.leases.has(tabId)
        )
          return false;
        headerEnabled = current.requestHeaderEnabled;
        this.leases.set(tabId, {
          tabId,
          sessionId: source.sessionId,
          turnId: source.turnId,
          origin: "agent",
          claimedAt: host.now(),
          instanceId,
          state: "active",
          requestHeaderEnabled: headerEnabled,
          requestHeaders: current.requestHeaders,
          ...(Object.hasOwn(current, "viewportSize")
            ? { viewportSize: current.viewportSize }
            : {}),
        });
        claimed = true;
        return true;
      });
      if (error != null && headerEnabled !== undefined) throw error;
      return claimed;
    }
    subscribeActiveTabLeaseChanges(listener: (tabIds: number[]) => unknown) {
      this.activeTabLeaseChangeHandlers.add(listener);
      return () => {
        this.activeTabLeaseChangeHandlers.delete(listener);
      };
    }
    mightHaveActiveTabLease(tabId: number) {
      return !this.storageLoaded || this.leases.get(tabId)?.state === "active";
    }
    async claimTab(
      sessionId: string,
      turnId: string,
      tabId: number,
      origin: TabLease["origin"],
      headerEnabled?: boolean,
      headers?: TabLease["requestHeaders"],
    ) {
      await this.ensureInit();
      const instanceId = await host.instanceId();
      const error = await this.mutate(() => {
        const current = this.leases.get(tabId);
        if (current?.state === "active") {
          if (current.sessionId !== sessionId)
            throw new Error(
              `Tab ${tabId} is already part of browser session ${current.sessionId}`,
            );
          if (current.turnId === turnId && current.instanceId === instanceId)
            return false;
          this.leases.set(tabId, { ...current, turnId, instanceId });
          return true;
        }
        this.leases.set(tabId, {
          tabId,
          sessionId,
          turnId,
          origin,
          claimedAt: host.now(),
          instanceId,
          state: "active",
          requestHeaderEnabled: headerEnabled,
          requestHeaders: headers,
        });
        return true;
      });
      if (error != null && headerEnabled !== undefined) throw error;
    }
    async setSessionRequestHeaderEnabled(sessionId: string, enabled: boolean) {
      await this.ensureInit();
      const error = await this.mutate(() => {
        let changed = false;
        for (const [id, lease] of this.leases) {
          if (
            lease.sessionId !== sessionId ||
            lease.requestHeaders !== undefined ||
            lease.requestHeaderEnabled === enabled
          )
            continue;
          this.leases.set(id, { ...lease, requestHeaderEnabled: enabled });
          changed = true;
        }
        return changed;
      });
      if (error != null) throw error;
    }
    async setSessionRequestHeaders(
      sessionId: string,
      headers: TabLease["requestHeaders"],
      enabled = false,
    ) {
      await this.ensureInit();
      const error = await this.mutate(() => {
        let changed = false;
        for (const [id, lease] of this.leases) {
          if (
            lease.sessionId !== sessionId ||
            (JSON.stringify(lease.requestHeaders) === JSON.stringify(headers) &&
              lease.requestHeaderEnabled ===
                (headers === undefined ? enabled : headers.length > 0))
          )
            continue;
          this.leases.set(id, {
            ...lease,
            requestHeaders: headers,
            requestHeaderEnabled:
              headers === undefined ? enabled : headers.length > 0,
          });
          changed = true;
        }
        return changed;
      });
      if (error != null) throw error;
    }
    async isClaimedBySession(sessionId: string, tabId: number) {
      await this.ensureInit();
      await this.waitForPendingMutations();
      const lease = this.leases.get(tabId);
      return lease?.state === "active" && lease.sessionId === sessionId;
    }
    async getSessionActiveLeases(sessionId: string) {
      return await this.getSessionLeases(sessionId, "active");
    }
    async getSessionHandoffLeases(sessionId: string) {
      return await this.getSessionLeases(sessionId, "handoff");
    }
    async setViewportSize(
      sessionId: string,
      turnId: string,
      tabId: number | null,
      viewport: ViewportSize | null,
    ) {
      await this.ensureInit();
      await this.mutate(() => {
        if (tabId == null) {
          this.pendingViewportSizes.set(sessionId, {
            turnId,
            viewportSize: viewport,
          });
          return true;
        }
        const lease = this.leases.get(tabId);
        if (
          lease?.state !== "active" ||
          lease.sessionId !== sessionId ||
          lease.turnId !== turnId
        )
          throw new Error(
            `Tab ${tabId} is not part of browser session ${sessionId}`,
          );
        this.leases.set(tabId, { ...lease, viewportSize: viewport });
        this.pendingViewportSizes.delete(sessionId);
        return true;
      });
    }
    async takeViewportSizeForAttach(
      sessionId: string,
      turnId: string,
      tabId: number,
    ) {
      await this.ensureInit();
      let viewport: ViewportSize | null | undefined;
      await this.mutate(() => {
        const lease = this.leases.get(tabId);
        if (lease?.state !== "active" || lease.sessionId !== sessionId)
          throw new Error(
            `Tab ${tabId} is not part of browser session ${sessionId}`,
          );
        if (Object.hasOwn(lease, "viewportSize")) {
          viewport = lease.viewportSize;
          return false;
        }
        const pending = this.pendingViewportSizes.get(sessionId);
        if (pending?.turnId !== turnId) return false;
        viewport = pending.viewportSize;
        this.pendingViewportSizes.delete(sessionId);
        this.leases.set(tabId, { ...lease, viewportSize: viewport });
        return true;
      });
      return viewport;
    }
    async clearPendingViewportSize(sessionId: string, turnId: string) {
      await this.ensureInit();
      await this.mutate(() =>
        this.pendingViewportSizes.get(sessionId)?.turnId !== turnId
          ? false
          : this.pendingViewportSizes.delete(sessionId),
      );
    }
    async setTabMark(
      sessionId: string,
      turnId: string,
      tabId: number,
      mark: TabLease["mark"],
    ) {
      await this.ensureInit();
      await this.mutate(() => {
        const lease = this.leases.get(tabId);
        if (
          lease?.state !== "active" ||
          lease.sessionId !== sessionId ||
          lease.turnId !== turnId
        )
          throw new Error(
            `Tab ${tabId} is not part of browser session ${sessionId}`,
          );
        if (lease.mark === mark) return false;
        this.leases.set(tabId, { ...lease, mark });
        return true;
      });
    }
    async replaceTurnMarks(
      sessionId: string,
      turnId: string,
      marks: Map<number, TabLease["mark"]>,
    ) {
      await this.ensureInit();
      await this.mutate(() => {
        let changed = false;
        for (const [id, lease] of this.leases) {
          if (
            lease.state !== "active" ||
            lease.sessionId !== sessionId ||
            lease.turnId !== turnId
          )
            continue;
          const mark = marks.get(id);
          if (lease.mark === mark) continue;
          const next = { ...lease };
          delete next.mark;
          this.leases.set(id, mark == null ? next : { ...next, mark });
          changed = true;
        }
        return changed;
      });
    }
    async getSessionTabs(sessionId: string) {
      const leases = await this.getSessionActiveLeases(sessionId);
      const results = await Promise.all(
        [...leases.keys()].map(async (tabId) => {
          try {
            return {
              tab: await host.chrome.tabs.get(tabId),
              tabId,
              state: "found",
            };
          } catch {
            return { tabId, state: "stale" };
          }
        }),
      );
      const tabs: chrome.tabs.Tab[] = [],
        stale: number[] = [];
      for (const result of results)
        if (result.state === "found") tabs.push(result.tab!);
        else stale.push(result.tabId);
      if (stale.length > 0) await this.releaseTabs(sessionId, stale);
      return tabs;
    }
    async updateActiveSessionTurn(sessionId: string, turnId: string) {
      await this.ensureInit();
      const instanceId = await host.instanceId();
      await this.mutate(() => {
        let changed = false;
        for (const [id, lease] of this.leases) {
          if (
            lease.sessionId !== sessionId ||
            lease.state !== "active" ||
            (lease.turnId === turnId && lease.instanceId === instanceId)
          )
            continue;
          const unmarked = { ...lease };
          delete unmarked.mark;
          this.leases.set(id, {
            ...(lease.turnId === turnId ? lease : unmarked),
            turnId,
            instanceId,
          });
          changed = true;
        }
        return changed;
      });
    }
    async handoffTabs(
      sessionId: string,
      turnId: string,
      tabIds: number[],
      options: { activeTabId?: number },
    ) {
      await this.ensureInit();
      const instanceId = await host.instanceId(),
        ids = new Set(tabIds);
      if (ids.size === 0) return;
      await this.mutate(() => {
        let changed = false;
        for (const id of ids) {
          const lease = this.leases.get(id);
          if (lease?.state !== "active" || lease.sessionId !== sessionId)
            continue;
          const next = { ...lease };
          delete next.mark;
          this.leases.set(id, {
            ...next,
            turnId,
            instanceId,
            state: "handoff",
            ...(options.activeTabId === id ? { isActiveHandoff: true } : {}),
          });
          changed = true;
        }
        return changed;
      });
    }
    async resumeHandoffTabs(
      sessionId: string,
      turnId: string,
      tabIds: number[],
    ) {
      await this.ensureInit();
      const instanceId = await host.instanceId(),
        ids = new Set(tabIds);
      if (ids.size === 0) return [];
      const resumed: number[] = [];
      let headersPresent = false;
      const error = await this.mutate(() => {
        let changed = false;
        for (const id of ids) {
          const lease = this.leases.get(id);
          if (lease?.state !== "handoff" || lease.sessionId !== sessionId)
            continue;
          this.leases.set(id, {
            tabId: id,
            sessionId,
            turnId,
            origin: lease.origin,
            claimedAt: lease.claimedAt,
            instanceId,
            state: "active",
            requestHeaderEnabled: lease.requestHeaderEnabled,
            requestHeaders: lease.requestHeaders,
            ...(Object.hasOwn(lease, "viewportSize")
              ? { viewportSize: lease.viewportSize }
              : {}),
          });
          resumed.push(id);
          headersPresent ||= lease.requestHeaderEnabled !== undefined;
          changed = true;
        }
        return changed;
      });
      if (error != null && headersPresent) throw error;
      return resumed;
    }
    async releaseTabs(sessionId: string, tabIds: number[]) {
      await this.ensureInit();
      const ids = new Set(tabIds);
      if (ids.size !== 0)
        await this.mutate(() => {
          let changed = false;
          for (const id of ids)
            if (this.leases.get(id)?.sessionId === sessionId) {
              this.leases.delete(id);
              changed = true;
            }
          return changed;
        });
    }
    async releaseActiveTurn(sessionId: string, turnId: string) {
      await this.ensureInit();
      await this.mutate(() => {
        let changed = false;
        for (const [id, lease] of this.leases)
          if (
            lease.sessionId === sessionId &&
            lease.turnId === turnId &&
            lease.state === "active"
          ) {
            this.leases.delete(id);
            changed = true;
          }
        return changed;
      });
    }
    async getSessionLeases(sessionId: string, state: TabLease["state"]) {
      await this.ensureInit();
      await this.waitForPendingMutations();
      return new Map(
        [...this.leases.entries()].filter(
          ([, lease]) => lease.sessionId === sessionId && lease.state === state,
        ),
      );
    }
    registerEventListeners() {
      if (!this.listenersRegistered) {
        this.listenersRegistered = true;
        host.chrome.tabs.onRemoved?.addListener(this.handleTabRemoved);
        host.chrome.tabs.onReplaced?.addListener(this.handleTabReplaced);
      }
    }
    async removeTab(tabId: number) {
      await this.ensureInit();
      await this.mutate(() => this.leases.delete(tabId));
    }
    async replaceTab(added: number, removed: number) {
      await this.ensureInit();
      await this.mutate(() => {
        const lease = this.leases.get(removed);
        if (lease == null) return false;
        this.leases.delete(removed);
        this.leases.set(added, { ...lease, tabId: added });
        return true;
      });
    }
    async loadFromStorage() {
      const previous = this.readActiveTabIds();
      let stored;
      try {
        stored = await this.storage.get(this.storageKey);
      } catch (error) {
        await this.requestHeaders.synchronize(new Map(), true);
        throw error;
      }
      for (const [id, lease] of parseStoredLeases(stored[this.storageKey]))
        this.leases.set(id, lease);
      for (const [session, viewport] of parsePendingViewports(
        stored[this.storageKey],
      ))
        this.pendingViewportSizes.set(session, viewport);
      this.storageLoaded = true;
      await this.requestHeaders.synchronize(
        this.readActiveRequestHeaders(),
        true,
      );
      this.publishActiveTabLeaseChanges(previous);
    }
    async mutate(operation: () => boolean | Promise<boolean>, force = false) {
      const run = async () => {
        const previous = this.readActiveTabIds(),
          leases = new Map(this.leases),
          viewports = new Map(this.pendingViewportSizes);
        try {
          if (await operation()) await this.saveToStorage();
        } catch (error) {
          this.leases.clear();
          for (const [id, lease] of leases) this.leases.set(id, lease);
          this.pendingViewportSizes.clear();
          for (const [session, viewport] of viewports)
            this.pendingViewportSizes.set(session, viewport);
          throw error;
        }
        const error = await this.requestHeaders.synchronize(
          this.readActiveRequestHeaders(),
          force,
        );
        this.publishActiveTabLeaseChanges(previous);
        return error;
      };
      const pending = this.mutationQueue.then(run, run);
      this.mutationQueue = pending.then(
        () => {},
        () => {},
      );
      return await pending;
    }
    async waitForPendingMutations() {
      await this.mutationQueue;
    }
    async saveToStorage() {
      const pending = Object.fromEntries(this.pendingViewportSizes.entries());
      const value = {
        leases: Object.fromEntries(this.leases.entries()),
        ...(Object.keys(pending).length > 0
          ? { pendingViewportSizes: pending }
          : {}),
      };
      await this.storage.set({ [this.storageKey]: value });
    }
    readActiveTabIds() {
      return new Set(
        [...this.leases.entries()]
          .filter(([, lease]) => lease.state === "active")
          .map(([id]) => id),
      );
    }
    readActiveRequestHeaders() {
      const active = new Map<number, TabRequestHeaders>();
      for (const [id, lease] of this.leases) {
        if (lease.state !== "active") continue;
        const headers =
          lease.requestHeaders === undefined
            ? lease.requestHeaderEnabled === true
              ? [
                  {
                    name: "x-browser-agent",
                    value: `ChatGPT/${lease.sessionId}`,
                  },
                ]
              : []
            : resolveRequestHeaders(lease.requestHeaders, lease.sessionId);
        if (headers.length > 0)
          active.set(id, { sessionId: lease.sessionId, headers });
      }
      return active;
    }
    publishActiveTabLeaseChanges(previous: Set<number>) {
      const changed = changedTabIds(previous, this.readActiveTabIds());
      if (changed.length !== 0)
        for (const listener of this.activeTabLeaseChangeHandlers)
          Promise.resolve(listener(changed)).catch(() => {});
    }
  };
}
function changedTabIds(before: Set<number>, after: Set<number>) {
  const changed = new Set<number>();
  for (const id of before) if (!after.has(id)) changed.add(id);
  for (const id of after) if (!before.has(id)) changed.add(id);
  return [...changed];
}
