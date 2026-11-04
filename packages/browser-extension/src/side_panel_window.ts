import type { createSidePanelTabController } from "./side_panel_tabs";
/** Original Dk/jf/qf/Hf/Nk/Ji/Uk/Gf: window and per-tab open state are distinct. */
export function createSidePanelWindowController(host: {
  chrome: Pick<typeof chrome, "sidePanel" | "windows" | "storage">;
  tabs: Pick<
    ReturnType<typeof createSidePanelTabController>,
    "enableTemporarily" | "setPersistent"
  >;
  isEdge(): boolean;
  browserName(): string;
  clearActionCallout(): Promise<unknown>;
  reportOpen(source: string): Promise<unknown>;
  warn(message: string): void;
}) {
  const openWindows = new Set<number>(),
    globalWindows = new Set<number>(),
    windowTabs = new Map<number, Set<number>>();
  let registered = false;
  function isOpen(windowId: number, tabId?: number) {
    return (
      globalWindows.has(windowId) ||
      (tabId != null && windowTabs.get(windowId)?.has(tabId) === true)
    );
  }
  function updateState(windowId: number, opened: boolean, tabId?: number) {
    if (tabId == null) {
      if (opened) globalWindows.add(windowId);
      else globalWindows.delete(windowId);
    } else {
      const tabs = windowTabs.get(windowId) ?? new Set<number>();
      if (opened) {
        tabs.add(tabId);
        windowTabs.set(windowId, tabs);
      } else {
        tabs.delete(tabId);
        if (tabs.size === 0) windowTabs.delete(windowId);
      }
    }
    if (globalWindows.has(windowId) || windowTabs.has(windowId))
      openWindows.add(windowId);
    else openWindows.delete(windowId);
  }
  async function recordState(
    windowId: number,
    opened: boolean,
    tabId?: number,
  ) {
    if (host.isEdge()) tabId = undefined;
    if (tabId != null) await host.tabs.setPersistent(tabId, opened);
    updateState(windowId, opened, tabId);
    await host.chrome.storage.session
      .set({ codexSidePanelOpenWindowIds: [...openWindows] })
      .catch(() => {});
    if (opened) await host.clearActionCallout().catch(() => {});
  }
  async function open(
    windowId: number,
    tabId: number | undefined,
    source: string,
  ) {
    const targetTab = host.isEdge() ? undefined : tabId;
    const enable =
      targetTab == null
        ? Promise.resolve()
        : host.tabs.enableTemporarily(targetTab);
    // Intentionally invoke open before awaiting enable to preserve user activation.
    const opening = host.chrome.sidePanel.open(
      targetTab == null ? { windowId } : { tabId: targetTab },
    );
    try {
      await Promise.all([enable, opening]);
    } catch (error) {
      if (targetTab != null)
        await host.tabs.setPersistent(targetTab, false).catch(() => {});
      throw error;
    }
    await recordState(windowId, true, targetTab);
    host
      .reportOpen(source)
      .catch(() =>
        host.warn("Failed to report Chrome extension sidechat open."),
      );
  }
  async function toggle(
    tab: Pick<chrome.tabs.Tab, "id" | "windowId"> | undefined,
    source: string,
  ) {
    const windowId =
      tab?.windowId ?? (await host.chrome.windows.getCurrent()).id;
    if (windowId == null)
      throw new Error(
        `Unable to find the current ${host.browserName()} window`,
      );
    const panel = host.chrome.sidePanel;
    if (panel == null || typeof panel.open !== "function") return;
    if (isOpen(windowId, tab?.id) && typeof panel.close === "function") {
      const tabId = tab?.id;
      const target =
        tabId != null && windowTabs.get(windowId)?.has(tabId) === true
          ? { tabId }
          : { windowId };
      try {
        await panel.close(target);
      } finally {
        await recordState(
          windowId,
          false,
          "tabId" in target ? target.tabId : undefined,
        );
      }
      return;
    }
    await open(windowId, tab?.id, source);
  }
  function register() {
    if (registered) return;
    const panel = host.chrome.sidePanel;
    if (panel != null) {
      panel.onOpened?.addListener((event) => {
        recordState(event.windowId, true, event.tabId).catch(() => {});
      });
      panel.onClosed?.addListener((event) => {
        recordState(event.windowId, false, event.tabId).catch(() => {});
      });
      registered = true;
    }
  }
  return { isOpen, updateState, recordState, open, toggle, register };
}
