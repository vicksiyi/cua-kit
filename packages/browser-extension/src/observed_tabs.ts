export interface ObservedTab {
  tabId: number;
  windowId: number;
}
function observedTab(tab: {
  id?: number;
  windowId?: number;
}): ObservedTab | null {
  return typeof tab.id !== "number" || typeof tab.windowId !== "number"
    ? null
    : { tabId: tab.id, windowId: tab.windowId };
}
function changedTabs(previous: Set<number>, next: Set<number>): Set<number> {
  const changed = new Set<number>();
  for (const id of previous) if (!next.has(id)) changed.add(id);
  for (const id of next) if (!previous.has(id)) changed.add(id);
  return changed;
}
/** Original oS/zu/cS: observed means active in any window, not only the focused window. */
export function createObservedTabsClass(chrome: typeof globalThis.chrome) {
  return class ObservedTabs {
    activeTabIds = new Set<number>();
    activeTabIdByWindowId = new Map<number, number>();
    listenersRegistered = false;
    onChanged: (ids: number[]) => unknown;
    handleTabActivated = (info: chrome.tabs.OnActivatedInfo) => {
      this.setWindowActiveTab(info.windowId, info.tabId);
    };
    handleTabCreated = (tab: chrome.tabs.Tab) => {
      if (tab.active !== true) return;
      const active = observedTab(tab);
      if (active != null)
        this.setWindowActiveTab(active.windowId, active.tabId);
    };
    handleActiveTabsChanged = () => {
      this.refreshActiveTabs();
    };
    constructor(options: { onChanged?(ids: number[]): unknown } = {}) {
      this.onChanged = options.onChanged ?? (() => {});
    }
    setChangeHandler(handler: (ids: number[]) => unknown) {
      this.onChanged = handler;
    }
    async initialize() {
      this.registerEventListeners();
      await this.refreshActiveTabs();
    }
    dispose() {
      if (!this.listenersRegistered) return;
      this.listenersRegistered = false;
      chrome.tabs.onActivated?.removeListener(this.handleTabActivated);
      chrome.tabs.onCreated?.removeListener(this.handleTabCreated);
      chrome.tabs.onRemoved?.removeListener(this.handleActiveTabsChanged);
      chrome.tabs.onReplaced?.removeListener(this.handleActiveTabsChanged);
      chrome.tabs.onAttached?.removeListener(this.handleActiveTabsChanged);
      chrome.tabs.onDetached?.removeListener(this.handleActiveTabsChanged);
      chrome.windows?.onCreated?.removeListener(this.handleActiveTabsChanged);
      chrome.windows?.onFocusChanged?.removeListener(
        this.handleActiveTabsChanged,
      );
      chrome.windows?.onRemoved?.removeListener(this.handleActiveTabsChanged);
    }
    isObserved(tabId: number) {
      return this.activeTabIds.has(tabId);
    }
    registerEventListeners() {
      if (this.listenersRegistered) return;
      this.listenersRegistered = true;
      chrome.tabs.onActivated?.addListener(this.handleTabActivated);
      chrome.tabs.onCreated?.addListener(this.handleTabCreated);
      chrome.tabs.onRemoved?.addListener(this.handleActiveTabsChanged);
      chrome.tabs.onReplaced?.addListener(this.handleActiveTabsChanged);
      chrome.tabs.onAttached?.addListener(this.handleActiveTabsChanged);
      chrome.tabs.onDetached?.addListener(this.handleActiveTabsChanged);
      chrome.windows?.onCreated?.addListener(this.handleActiveTabsChanged);
      chrome.windows?.onFocusChanged?.addListener(this.handleActiveTabsChanged);
      chrome.windows?.onRemoved?.addListener(this.handleActiveTabsChanged);
    }
    async refreshActiveTabs() {
      const tabs = await chrome.tabs.query({ active: true });
      this.setActiveTabs(tabs.flatMap((tab) => observedTab(tab) ?? []));
    }
    setActiveTabs(tabs: ObservedTab[]) {
      const active = new Set<number>(),
        byWindow = new Map<number, number>();
      for (const tab of tabs) {
        active.add(tab.tabId);
        byWindow.set(tab.windowId, tab.tabId);
      }
      const changed = changedTabs(this.activeTabIds, active);
      this.activeTabIds = active;
      this.activeTabIdByWindowId = byWindow;
      this.publishChangedTabs(changed);
    }
    setWindowActiveTab(windowId: number, tabId: number) {
      const changed = new Set<number>(),
        previous = this.activeTabIdByWindowId.get(windowId);
      if (previous !== undefined && previous !== tabId) {
        this.activeTabIds.delete(previous);
        changed.add(previous);
      }
      this.activeTabIdByWindowId.set(windowId, tabId);
      if (!this.activeTabIds.has(tabId)) {
        this.activeTabIds.add(tabId);
        changed.add(tabId);
      }
      this.publishChangedTabs(changed);
    }
    publishChangedTabs(ids: Iterable<number>) {
      const changed = Array.from(ids);
      if (changed.length !== 0)
        Promise.resolve(this.onChanged(changed)).catch(() => {});
    }
  };
}
