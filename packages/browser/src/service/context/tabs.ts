export interface ServiceTab {
  id: number;
  title?: string | null;
  url?: string | null;
  active?: boolean;
  [key: string]: unknown;
}
export interface TabsProvider {
  createTab(preferredWindowId?: number): Promise<ServiceTab>;
  getTabs(): Promise<ServiceTab[]>;
  markTab(tabId: number, mark: unknown): Promise<unknown>;
}
/** Original gg. Public fields are initialized before constructor assignment. */
export class ServiceTabs {
  api: TabsProvider;
  preferredWindowId: number | undefined;
  constructor(api: TabsProvider, preferredWindowId?: number) {
    this.api = api;
    this.preferredWindowId = preferredWindowId;
  }
  async create() {
    return await this.api.createTab(this.preferredWindowId);
  }
  async list() {
    return await this.api.getTabs();
  }
  async mark(tabId: number, mark: unknown) {
    await this.api.markTab(tabId, mark);
  }
  async get(tabId: number) {
    const tabs = await this.list(),
      tab = tabs.find((item) => item.id === tabId);
    if (tab == null) {
      const existing = tabs.length
        ? tabs
            .map(
              (item) =>
                `${item.id}|${item.title ?? "<no title>"}|${item.url ?? "<no url>"}`,
            )
            .join(", ")
        : "none";
      throw new Error(`Tab not found: ${tabId}. Existing tabs: ${existing}`);
    }
    return tab;
  }
  async getActive() {
    const tab = (await this.list()).find((item) => item.active);
    if (tab == null) throw new Error("No active tab found");
    return tab;
  }
}
