import { createContentRuntime, isFaviconBadgeUrl } from "./content_runtime";
import { createFaviconResourceReader } from "./favicon_resource";
type FinalizedBadge = "deliverable" | "handoff";
type Badge = FinalizedBadge | "active" | null;
interface LeaseSource {
  subscribeActiveTabLeaseChanges(
    callback: (ids: Iterable<number>) => void,
  ): () => void;
  ensureInit(): Promise<void>;
  getOwningSessionId(tabId: number): Promise<string | null | undefined>;
  mightHaveActiveTabLease(tabId: number): boolean;
}
const clearBadge = {
  type: "TAB_FAVICON_BADGE",
  badge: null,
  faviconDataUrl: null,
};
/** Original Ma/Kt: state and publication queues intentionally have separate lifetimes. */
export function createTabFaviconManagerClass(host: {
  chrome: typeof chrome;
  tabLeases: { getInstance(): LeaseSource };
  fetch: typeof globalThis.fetch;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}) {
  const chrome = host.chrome;
  const content = createContentRuntime(host),
    resources = createFaviconResourceReader(host);
  class TabFaviconManager {
    static instance: TabFaviconManager | null = null;
    unseenFinalizedBadges = new Map<number, FinalizedBadge>();
    storageKey = "TAB_FAVICON_BADGES";
    storage: Pick<chrome.storage.StorageArea, "get" | "set">;
    tabLeases = host.tabLeases.getInstance();
    faviconDataUrls = new Map<number, { dataUrl: string; pageUrl: string }>();
    closingTabIds = new Set<number>();
    initializePromise: Promise<void> | null = null;
    stateOperationQueue: Promise<void> = Promise.resolve();
    publicationQueue: Promise<void> = Promise.resolve();
    listenersRegistered = false;
    unsubscribeActiveTabLeaseChanges: (() => void) | null = null;
    handleTabActivated = (info: { tabId: number }) => {
      this.clearFinalizedBadge(info.tabId);
    };
    handleWindowFocused = (id: number) => {
      if (id !== chrome.windows.WINDOW_ID_NONE)
        this.clearFocusedWindowFinalizedBadge(id);
    };
    handleTabUpdated = (tabId: number, change: chrome.tabs.OnUpdatedInfo) => {
      const url = change.favIconUrl,
        present = url != null,
        badge = typeof url === "string" && isFaviconBadgeUrl(url);
      if (change.url != null || (present && !badge))
        this.faviconDataUrls.delete(tabId);
      if (change.status === "complete" || (present && !badge)) {
        if (this.closingTabIds.has(tabId) || !this.mightHaveBadge(tabId))
          return;
        this.republishBadge(tabId);
      }
    };
    handleTabRemoved = (tabId: number) => {
      this.closingTabIds.delete(tabId);
      this.faviconDataUrls.delete(tabId);
      this.forgetFinalizedBadge(tabId);
    };
    handleTabReplaced = (added: number, removed: number) => {
      this.closingTabIds.delete(removed);
      this.faviconDataUrls.delete(removed);
      this.faviconDataUrls.delete(added);
      this.replaceFinalizedBadge(added, removed);
    };
    handleActiveTabLeaseChanges = (ids: Iterable<number>) => {
      this.reconcileActiveTabLeaseChanges(ids);
    };
    static getInstance() {
      return (
        TabFaviconManager.instance ||
          (TabFaviconManager.instance = new TabFaviconManager()),
        TabFaviconManager.instance
      );
    }
    constructor(
      storage: Pick<chrome.storage.StorageArea, "get" | "set"> = chrome.storage
        .session,
    ) {
      this.storage = storage;
      this.unsubscribeActiveTabLeaseChanges =
        this.tabLeases.subscribeActiveTabLeaseChanges(
          this.handleActiveTabLeaseChanges,
        );
      this.registerEventListeners();
      this.ensureInit().catch(() => {});
      this.tabLeases.ensureInit().catch(() => {});
    }
    async ensureInit() {
      if (!this.initializePromise)
        this.initializePromise = this.loadFromStorage();
      await this.initializePromise;
    }
    async markFinalized(tabId: number, badge: FinalizedBadge) {
      await this.ensureInit();
      await this.runStateOperation(async () => {
        const unseen = !(await this.tabIsVisible(tabId));
        await this.updateUnseenFinalizedBadges(() =>
          unseen
            ? this.unseenFinalizedBadges.get(tabId) === badge
              ? false
              : (this.unseenFinalizedBadges.set(tabId, badge), true)
            : this.unseenFinalizedBadges.delete(tabId),
        );
      });
      this.scheduleReconcileTab(tabId);
    }
    async restoreTabFaviconsBestEffort(tabIds: number[]) {
      await content.withTimeout(
        Promise.allSettled(
          tabIds.map(async (tabId) => {
            await chrome.tabs.sendMessage(tabId, clearBadge);
          }),
        ),
        250,
      );
    }
    async closeTabsWithFaviconRestore<T>(
      tabIds: number[],
      close: () => Promise<T>,
    ): Promise<T> {
      for (const id of tabIds) this.closingTabIds.add(id);
      await this.restoreTabFaviconsBestEffort(tabIds);
      try {
        return await close();
      } catch (error) {
        for (const id of tabIds) this.closingTabIds.delete(id);
        throw error;
      }
    }
    dispose() {
      if (this.listenersRegistered) {
        this.listenersRegistered = false;
        chrome.tabs.onActivated?.removeListener(this.handleTabActivated);
        chrome.tabs.onUpdated?.removeListener(this.handleTabUpdated);
        chrome.tabs.onRemoved?.removeListener(this.handleTabRemoved);
        chrome.tabs.onReplaced?.removeListener(this.handleTabReplaced);
        chrome.windows.onFocusChanged?.removeListener(this.handleWindowFocused);
      }
      this.unsubscribeActiveTabLeaseChanges?.();
      this.unsubscribeActiveTabLeaseChanges = null;
      this.closingTabIds.clear();
      if (TabFaviconManager.instance === this)
        TabFaviconManager.instance = null;
    }
    registerEventListeners() {
      if (this.listenersRegistered) return;
      this.listenersRegistered = true;
      chrome.tabs.onActivated?.addListener(this.handleTabActivated);
      chrome.tabs.onUpdated?.addListener(this.handleTabUpdated);
      chrome.tabs.onRemoved?.addListener(this.handleTabRemoved);
      chrome.tabs.onReplaced?.addListener(this.handleTabReplaced);
      chrome.windows.onFocusChanged?.addListener(this.handleWindowFocused);
    }
    async clearFinalizedBadge(tabId: number) {
      await this.ensureInit();
      let changed = false;
      await this.runStateOperation(async () => {
        if (this.unseenFinalizedBadges.has(tabId))
          await this.updateUnseenFinalizedBadges(
            () => (changed = this.unseenFinalizedBadges.delete(tabId)),
          );
      });
      if (changed) this.scheduleReconcileTab(tabId);
    }
    async clearFocusedWindowFinalizedBadge(windowId: number) {
      if (!(await this.hasUnseenFinalizedBadges())) return;
      let tabs;
      try {
        tabs = await chrome.tabs.query({ active: true, windowId });
      } catch {
        return;
      }
      const tabId = tabs.find((tab) => typeof tab.id === "number")?.id;
      if (tabId != null) await this.clearFinalizedBadge(tabId);
    }
    async hasUnseenFinalizedBadges() {
      await this.ensureInit();
      let present = false;
      await this.runStateOperation(async () => {
        present = this.unseenFinalizedBadges.size > 0;
      });
      return present;
    }
    async forgetFinalizedBadge(tabId: number) {
      await this.ensureInit();
      await this.runStateOperation(async () => {
        await this.updateUnseenFinalizedBadges(() =>
          this.unseenFinalizedBadges.delete(tabId),
        );
      });
    }
    async replaceFinalizedBadge(added: number, removed: number) {
      await this.ensureInit();
      let badge: FinalizedBadge | null = null;
      await this.runStateOperation(async () => {
        await this.updateUnseenFinalizedBadges(() => {
          const previous = this.unseenFinalizedBadges.get(removed);
          if (previous == null) return false;
          this.unseenFinalizedBadges.delete(removed);
          this.unseenFinalizedBadges.set(added, previous);
          badge = previous;
          return true;
        });
      });
      if (badge != null) this.scheduleReconcileTab(added);
    }
    async republishBadge(tabId: number) {
      await this.ensureInit();
      await this.waitForStateOperations();
      const badge = await this.readEffectiveBadge(tabId);
      if (badge != null) this.schedulePublishBadge(tabId, badge);
    }
    async reconcileActiveTabLeaseChanges(ids: Iterable<number>) {
      await this.ensureInit();
      const tabIds = [...ids];
      await this.runStateOperation(async () => {
        let changed = false;
        for (const id of tabIds)
          if ((await this.tabLeases.getOwningSessionId(id)) != null)
            changed = this.unseenFinalizedBadges.delete(id) || changed;
        if (changed) await this.saveToStorage();
      });
      for (const id of tabIds) this.scheduleReconcileTab(id);
    }
    async reconcileTab(tabId: number) {
      await this.publishBadge(tabId, await this.readEffectiveBadge(tabId));
    }
    async readEffectiveBadge(tabId: number): Promise<Badge> {
      return (await this.tabLeases.getOwningSessionId(tabId)) != null
        ? "active"
        : (this.unseenFinalizedBadges.get(tabId) ?? null);
    }
    mightHaveBadge(tabId: number) {
      return (
        this.unseenFinalizedBadges.has(tabId) ||
        this.tabLeases.mightHaveActiveTabLease(tabId)
      );
    }
    async tabIsVisible(tabId: number) {
      try {
        const tab = await chrome.tabs.get(tabId);
        return tab.active !== true || typeof tab.windowId !== "number"
          ? false
          : (await chrome.windows.get(tab.windowId)).focused === true;
      } catch {
        return false;
      }
    }
    async loadFromStorage() {
      const stored: any = (await this.storage.get(this.storageKey))[
        this.storageKey
      ];
      if (
        !stored ||
        typeof stored !== "object" ||
        !("badges" in stored) ||
        !stored.badges ||
        typeof stored.badges !== "object" ||
        Array.isArray(stored.badges)
      )
        return;
      const ids: number[] = [];
      for (const [key, badge] of Object.entries(stored.badges)) {
        const id = Number(key);
        if (
          Number.isInteger(id) &&
          (badge === "deliverable" || badge === "handoff")
        ) {
          this.unseenFinalizedBadges.set(id, badge);
          ids.push(id);
        }
      }
      for (const id of ids) this.scheduleReconcileTab(id);
    }
    async runStateOperation(operation: () => Promise<void>) {
      const pending = this.stateOperationQueue.then(operation, operation);
      this.stateOperationQueue = pending.then(
        () => {},
        () => {},
      );
      await pending;
    }
    async waitForStateOperations() {
      await this.stateOperationQueue;
    }
    scheduleReconcileTab(tabId: number) {
      this.schedulePublication(async () => {
        await this.reconcileTab(tabId);
      });
    }
    schedulePublishBadge(tabId: number, badge: Badge) {
      this.schedulePublication(async () => {
        await this.publishBadge(tabId, badge);
      });
    }
    schedulePublication(operation: () => Promise<void>) {
      const pending = this.publicationQueue.then(operation, operation);
      this.publicationQueue = pending.then(
        () => {},
        () => {},
      );
      pending.catch(() => {});
    }
    async updateUnseenFinalizedBadges(update: () => boolean) {
      if (update()) await this.saveToStorage();
    }
    async saveToStorage() {
      await this.storage.set({
        [this.storageKey]: {
          badges: Object.fromEntries(this.unseenFinalizedBadges.entries()),
        },
      });
    }
    async publishBadge(tabId: number, badge: Badge) {
      if (this.closingTabIds.has(tabId)) return;
      const [ready, dataUrl] = await Promise.all([
        content.ensureContentScript(tabId),
        badge == null ? Promise.resolve(null) : this.readFaviconDataUrl(tabId),
      ]);
      if (!ready || this.closingTabIds.has(tabId)) return;
      const message =
        badge == null || dataUrl == null
          ? clearBadge
          : { type: "TAB_FAVICON_BADGE", badge, faviconDataUrl: dataUrl };
      try {
        await content.withTimeout(chrome.tabs.sendMessage(tabId, message));
      } catch {}
    }
    getCachedFaviconDataUrl(tabId: number, pageUrl: string) {
      const cached = this.faviconDataUrls.get(tabId);
      return cached?.pageUrl === pageUrl ? cached.dataUrl : null;
    }
    async readFaviconDataUrl(tabId: number, expectedUrl?: string) {
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        return null;
      }
      if (
        typeof tab.url !== "string" ||
        tab.url.length === 0 ||
        (expectedUrl != null && tab.url !== expectedUrl)
      )
        return null;
      const url = tab.url,
        icon = tab.favIconUrl,
        cached = this.getCachedFaviconDataUrl(tabId, url);
      if (cached != null) return cached;
      if (
        typeof icon !== "string" ||
        icon.length === 0 ||
        isFaviconBadgeUrl(icon)
      )
        return null;
      const dataUrl = await resources.readPageFavicon(url);
      if (dataUrl == null) return null;
      let after;
      try {
        after = await chrome.tabs.get(tabId);
      } catch {
        return null;
      }
      if (after.url !== url || after.favIconUrl !== icon) return null;
      this.faviconDataUrls.set(tabId, { dataUrl, pageUrl: url });
      return dataUrl;
    }
  }
  return TabFaviconManager;
}
