/** Original wi/Jr: presence is an undefined check, not integer validation. */
function hasTabId(
  tab: chrome.tabs.Tab,
): tab is chrome.tabs.Tab & { id: number } {
  return tab.id !== undefined;
}
export function toBrowserTabInfo(tab: chrome.tabs.Tab) {
  return {
    id: tab.id,
    title: tab.title,
    active: tab.active,
    faviconUrl: tab.favIconUrl,
    url: tab.url,
  };
}
/** Original vE/yt/Id/Ad/za/bE. No window, tab or navigation is created until invoked. */
export function createTabRuntime(host: {
  chrome: Pick<typeof chrome, "tabs" | "windows">;
  now(): number;
  setTimeout: typeof globalThis.setTimeout;
}) {
  const blankUrl = "about:blank";
  async function getTab(tabId: number) {
    const tab = await host.chrome.tabs.get(tabId);
    if (hasTabId(tab)) return tab;
    throw new Error(`Browser tab ${tabId} has no id`);
  }
  async function selectWindow(preferredWindowId?: number) {
    const windows = await host.chrome.windows.getAll({
      windowTypes: ["normal"],
    });
    const preferred = windows.find((window) => window.id === preferredWindowId);
    if (preferred?.id !== undefined) return preferred.id;
    const focused = windows.find(
      (window) => window.focused && window.id !== undefined,
    );
    if (focused?.id !== undefined) return focused.id;
    return windows.find((window) => window.id !== undefined)?.id ?? null;
  }
  async function createInWindow(windowId: number) {
    const tab = await host.chrome.tabs.create({
      active: false,
      url: blankUrl,
      windowId,
    });
    if (hasTabId(tab)) return tab;
    throw new Error("Created tab has no id");
  }
  async function createWindowAndTab() {
    const window = await host.chrome.windows.create({
      focused: false,
      type: "normal",
      url: blankUrl,
    });
    const tab = window?.tabs?.find(hasTabId);
    if (tab) return tab;
    if (window?.id === undefined)
      throw new Error("Created browser window has no id");
    return await createInWindow(window.id);
  }
  async function createTab(preferredWindowId?: number) {
    const selected = await selectWindow(preferredWindowId);
    if (selected == null) return toBrowserTabInfo(await createWindowAndTab());
    let tab;
    try {
      tab = await createInWindow(selected);
    } catch (error) {
      if (selected !== preferredWindowId) throw error;
      const replacement = await selectWindow(preferredWindowId);
      if (replacement === preferredWindowId) throw error;
      tab =
        replacement == null
          ? await createWindowAndTab()
          : await createInWindow(replacement);
    }
    return toBrowserTabInfo(tab);
  }
  async function prepareNewTab(tabId: number) {
    const updated = await host.chrome.tabs.update(tabId, { url: blankUrl });
    if (updated == null || !hasTabId(updated))
      throw new Error(`Browser tab ${tabId} has no id`);
    if (updated.url === blankUrl) return updated;
    const deadline = host.now() + 5000;
    let tab = await getTab(tabId);
    while (tab.url !== blankUrl) {
      if (host.now() >= deadline)
        throw new Error(`Browser tab ${tabId} did not navigate to ${blankUrl}`);
      await new Promise<void>((resolve) => host.setTimeout(resolve, 25));
      tab = await getTab(tabId);
    }
    return tab;
  }
  return {
    getTab,
    selectWindow,
    createInWindow,
    createWindowAndTab,
    createTab,
    prepareNewTab,
    tabInfo: toBrowserTabInfo,
  };
}
