/** Original Vu/lS/Wu/Ku and Ra/Oa: only undo muting owned by this extension. */
export function createTabAudioController(chrome: typeof globalThis.chrome) {
  const pendingMuteTabIds = new Set<number>();
  const restoreAfterMuteTabIds = new Set<number>();
  async function getTab(tabId: number) {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }
  async function restoreTabAudio(tabId: number): Promise<void> {
    const tab = await getTab(tabId);
    if (
      !tab ||
      tab.mutedInfo?.muted !== true ||
      tab.mutedInfo.reason !== "extension" ||
      tab.mutedInfo.extensionId !== chrome.runtime.id
    )
      return;
    try {
      await chrome.tabs.update(tabId, { muted: false });
    } catch {}
  }
  async function restoreTabsAudio(tabIds: number[]): Promise<void> {
    await Promise.allSettled(
      tabIds.map(async (tabId) => restoreTabAudio(tabId)),
    );
  }
  async function muteBackgroundTab(tabId: number): Promise<void> {
    pendingMuteTabIds.add(tabId);
    try {
      const tab = await getTab(tabId);
      if (!tab || tab.active === true || tab.mutedInfo?.muted === true) return;
      try {
        await chrome.tabs.update(tabId, { muted: true });
      } catch {
        return;
      }
      if (restoreAfterMuteTabIds.has(tabId)) await restoreTabAudio(tabId);
    } finally {
      pendingMuteTabIds.delete(tabId);
      restoreAfterMuteTabIds.delete(tabId);
    }
  }
  /** Original hi.setChangeHandler callback, including the activation-during-mute race. */
  function installObservedChangeHandler(
    observed: {
      isObserved(tabId: number): boolean;
      setChangeHandler(handler: (ids: number[]) => unknown): void;
    },
    overlay: { republishTabStates(ids: number[]): Promise<void> },
  ) {
    observed.setChangeHandler(async (ids) => {
      const active = ids.filter((id) => observed.isObserved(id));
      for (const id of active)
        if (pendingMuteTabIds.has(id)) restoreAfterMuteTabIds.add(id);
      await Promise.all([
        overlay.republishTabStates(ids),
        restoreTabsAudio(active),
      ]);
    });
  }
  return {
    muteBackgroundTab,
    restoreTabAudio,
    restoreTabsAudio,
    installObservedChangeHandler,
  };
}
