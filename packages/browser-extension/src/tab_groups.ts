const groupColors = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
] as const;
function normalizedTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const title = value.trim();
  return title.length > 0 ? title : undefined;
}
/** Original bS/yn, Da and vS. Factory isolates the original module singleton. */
export function createTabGroupManagerClass(host: {
  chrome: typeof chrome;
  random(): number;
}) {
  const chrome = host.chrome;
  class TabGroupManager {
    static instance: TabGroupManager | null = null;
    defaultSessionGroupTitle = "ChatGPT";
    managedGroupIds = new Set<number>();
    sessionGroupTitles = new Map<string, string>();
    initializePromise: Promise<void> | null = null;
    listenersRegistered = false;
    storageKey = "TAB_GROUPS";
    static getInstance() {
      return (
        TabGroupManager.instance ||
          (TabGroupManager.instance = new TabGroupManager()),
        TabGroupManager.instance
      );
    }
    async ensureInit() {
      if (!this.initializePromise) {
        this.registerEventListeners();
        this.initializePromise = this.loadFromStorage();
      }
      await this.initializePromise;
    }
    async ensureAgentTabGroup(
      sessionId: string,
      tabId: number,
      relatedTabIds: number[],
    ) {
      await this.ensureInit();
      const group = await this.findManagedGroupContainingTabs(relatedTabIds);
      if (group != null) {
        await this.addTabToGroup(group, tabId);
        return;
      }
      await this.createGroup(tabId, this.sessionGroupTitles.get(sessionId));
      await this.saveToStorage();
    }
    async releaseTabsFromManagedGroups(tabIds: number[]) {
      await this.ensureInit();
      const unique = new Set(tabIds);
      if (unique.size === 0) return;
      const memberships = await Promise.all(
        [...unique].map(async (tabId) => {
          try {
            const tab = await chrome.tabs.get(tabId);
            return typeof tab.groupId !== "number" ||
              !this.managedGroupIds.has(tab.groupId)
              ? null
              : { groupId: tab.groupId, tabId };
          } catch {
            return null;
          }
        }),
      );
      const released: number[] = [],
        groups = new Set<number>();
      for (const membership of memberships)
        if (membership != null) {
          released.push(membership.tabId);
          groups.add(membership.groupId);
        }
      if (released.length > 0 && chrome.tabs.ungroup)
        await Promise.allSettled(
          released.map(async (tabId) => await chrome.tabs.ungroup(tabId)),
        );
      let changed = false;
      for (const group of groups)
        changed = (await this.removeManagedGroupIfEmpty(group)) || changed;
      if (changed) await this.saveToStorage();
    }
    async refreshManagedGroupsFromChrome() {
      await this.ensureInit();
      let changed = false;
      for (const group of Array.from(this.managedGroupIds))
        changed = (await this.removeManagedGroupIfEmpty(group)) || changed;
      if (changed) await this.saveToStorage();
    }
    async setSessionGroupTitle(
      sessionId: string,
      title: unknown,
      relatedTabIds: number[],
    ) {
      await this.ensureInit();
      const normalized = normalizedTitle(title),
        changed = this.sessionGroupTitles.get(sessionId) !== normalized;
      if (normalized) this.sessionGroupTitles.set(sessionId, normalized);
      else this.sessionGroupTitles.delete(sessionId);
      const group = await this.findManagedGroupContainingTabs(relatedTabIds);
      if (group != null && chrome.tabGroups?.update)
        try {
          await chrome.tabGroups.update(group, {
            title: normalized ?? this.defaultSessionGroupTitle,
          });
        } catch {}
      if (changed) await this.saveToStorage();
    }
    async loadFromStorage() {
      const stored: any = (await chrome.storage.local.get(this.storageKey))[
        this.storageKey
      ];
      if (stored) {
        if (Array.isArray(stored)) {
          for (const group of stored)
            if (group && typeof group.chromeGroupId === "number")
              this.managedGroupIds.add(group.chromeGroupId);
          return;
        }
        for (const group of stored.groups ?? [])
          if (group && typeof group.chromeGroupId === "number")
            this.managedGroupIds.add(group.chromeGroupId);
        for (const [sessionId, title] of Object.entries(
          stored.sessionGroupTitles ?? {},
        )) {
          const normalized = normalizedTitle(title);
          if (normalized) this.sessionGroupTitles.set(sessionId, normalized);
        }
      }
    }
    async saveToStorage() {
      const value = {
        groups: Array.from(this.managedGroupIds, (chromeGroupId) => ({
          chromeGroupId,
        })),
        sessionGroupTitles: Object.fromEntries(
          this.sessionGroupTitles.entries(),
        ),
      };
      await chrome.storage.local.set({ [this.storageKey]: value });
    }
    async createGroup(tabId: number, title?: string) {
      const { windowId } = await chrome.tabs.get(tabId);
      const group = await chrome.tabs.group({
        createProperties: { windowId },
        tabIds: [tabId],
      });
      this.managedGroupIds.add(group);
      if (chrome.tabGroups?.update)
        try {
          await chrome.tabGroups.update(group, {
            color:
              groupColors[Math.floor(host.random() * groupColors.length)] ??
              groupColors[0],
            title: normalizedTitle(title) ?? this.defaultSessionGroupTitle,
          });
        } catch {}
    }
    async addTabToGroup(groupId: number, tabId: number) {
      if ((await chrome.tabs.get(tabId)).groupId !== groupId)
        await chrome.tabs.group({ groupId, tabIds: tabId });
    }
    registerEventListeners() {
      if (this.listenersRegistered || !chrome.tabGroups) return;
      this.listenersRegistered = true;
      chrome.tabGroups.onRemoved?.addListener((group) => {
        this.handleRemovedGroup(group.id);
      });
    }
    handleRemovedGroup(groupId: number) {
      if (this.managedGroupIds.delete(groupId)) this.saveToStorage();
    }
    async readGroup(groupId: number) {
      if (!chrome.tabGroups?.get) return null;
      try {
        return await chrome.tabGroups.get(groupId);
      } catch {
        return null;
      }
    }
    async removeManagedGroupIfEmpty(groupId: number) {
      if ((await this.groupTabIds(groupId)).length > 0) return false;
      this.managedGroupIds.delete(groupId);
      return true;
    }
    async groupTabIds(groupId: number) {
      return (await chrome.tabs.query({ groupId }))
        .map((tab) => tab.id)
        .filter((id) => typeof id === "number");
    }
    async findManagedGroupContainingTabs(tabIds: number[]) {
      for (const tabId of tabIds)
        try {
          const tab = await chrome.tabs.get(tabId);
          if (typeof tab.groupId !== "number") continue;
          if (
            this.managedGroupIds.has(tab.groupId) &&
            (await this.readGroup(tab.groupId))
          )
            return tab.groupId;
        } catch {}
      return null;
    }
  }
  return TabGroupManager;
}
