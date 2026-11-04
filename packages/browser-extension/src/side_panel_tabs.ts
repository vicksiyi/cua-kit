export const SIDE_PANEL_PATH = "codex-work-sidepanel.html";
export const SIDE_PANEL_TAB_IDS = "codexWorkSidePanelTabIds";
export function sidePanelConversationKey(tabId: number) {
  return `codexWorkSidePanelConversationUrl:${tabId}`;
}
export function sidePanelInvocationKey(tabId: number) {
  return `codexWorkSidePanelInvocation:${tabId}`;
}
/** Original Sk/Df/Ek/Tk/Ik/Ak/$o/Fo/Ck/Nf/kk. One factory owns one background's state. */
export function createSidePanelTabController(host: {
  chrome: Pick<typeof chrome, "tabs" | "sidePanel" | "storage">;
  isEdge(): boolean;
  warn(message: string): void;
}) {
  const persistentTabs = new Set<number>(),
    temporaryTabs = new Set<number>();
  let loaded: Promise<void> | undefined;
  let unregister: (() => void) | undefined;
  async function load() {
    const storage = host.chrome.storage.session;
    if (storage != null)
      try {
        const value = (await storage.get(SIDE_PANEL_TAB_IDS))[
          SIDE_PANEL_TAB_IDS
        ];
        if (!Array.isArray(value)) return;
        for (const id of value)
          if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0)
            persistentTabs.add(id);
      } catch {}
  }
  async function ensureLoaded() {
    loaded ??= load();
    await loaded;
  }
  async function persist() {
    await host.chrome.storage.session
      ?.set({ [SIDE_PANEL_TAB_IDS]: [...persistentTabs] })
      .catch(() => {});
  }
  function enableTemporarily(tabId: number) {
    temporaryTabs.add(tabId);
    return host.chrome.sidePanel.setOptions({
      enabled: true,
      path: SIDE_PANEL_PATH,
      tabId,
    });
  }
  async function setPersistent(tabId: number, enabled: boolean) {
    if (host.isEdge()) return;
    await ensureLoaded();
    temporaryTabs.delete(tabId);
    if (enabled) persistentTabs.add(tabId);
    else persistentTabs.delete(tabId);
    await persist();
    if (!enabled)
      await host.chrome.sidePanel.setOptions({
        enabled: false,
        path: SIDE_PANEL_PATH,
        tabId,
      });
  }
  async function refreshTab(tabId: number) {
    if (host.isEdge()) return;
    await ensureLoaded();
    await host.chrome.sidePanel.setOptions({
      enabled: persistentTabs.has(tabId) || temporaryTabs.has(tabId),
      path: SIDE_PANEL_PATH,
      tabId,
    });
  }
  async function removeTab(tabId: number) {
    await ensureLoaded();
    temporaryTabs.delete(tabId);
    if (persistentTabs.delete(tabId)) await persist();
    await host.chrome.storage.session
      ?.remove?.([
        sidePanelConversationKey(tabId),
        sidePanelInvocationKey(tabId),
      ])
      .catch(() => {});
  }
  async function configureDefault() {
    const enabled = host.isEdge(),
      options = await host.chrome.sidePanel.getOptions({});
    if (options.enabled !== enabled || options.path !== SIDE_PANEL_PATH)
      await host.chrome.sidePanel.setOptions({
        enabled,
        path: SIDE_PANEL_PATH,
      });
  }
  async function refreshAllTabs() {
    if (host.isEdge()) return;
    const tabs = await host.chrome.tabs.query({});
    await Promise.all(
      tabs.map((tab) =>
        tab.id == null ? Promise.resolve() : refreshTab(tab.id),
      ),
    );
  }
  async function initialize() {
    await configureDefault();
    await refreshAllTabs();
    await host.chrome.sidePanel.setPanelBehavior?.({
      openPanelOnActionClick: true,
    });
  }
  function register() {
    if (unregister != null) return unregister;
    const activated = ({ tabId }: chrome.tabs.OnActivatedInfo) => {
      refreshTab(tabId).catch(() => {});
    };
    const created = (tab: chrome.tabs.Tab) => {
      if (tab.id != null) refreshTab(tab.id).catch(() => {});
    };
    const removed = (tabId: number) => {
      removeTab(tabId).catch(() => {});
    };
    host.chrome.tabs.onActivated.addListener(activated);
    host.chrome.tabs.onCreated.addListener(created);
    host.chrome.tabs.onRemoved.addListener(removed);
    initialize().catch(() =>
      host.warn("Failed to initialize Chrome side panel destination."),
    );
    unregister = () => {
      host.chrome.tabs.onActivated.removeListener(activated);
      host.chrome.tabs.onCreated.removeListener(created);
      host.chrome.tabs.onRemoved.removeListener(removed);
      unregister = undefined;
    };
    return unregister;
  }
  return {
    enableTemporarily,
    setPersistent,
    refreshTab,
    removeTab,
    configureDefault,
    refreshAllTabs,
    initialize,
    register,
  };
}
