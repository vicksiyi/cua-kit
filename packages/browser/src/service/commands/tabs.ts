import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
export interface ServiceTab {
  id: number;
  providerTabId?: unknown;
  title?: string;
  url?: string;
  sessionControlled?: boolean;
}
export interface TabCommandContext {
  tabs: {
    create(): Promise<ServiceTab>;
    get(id: number): Promise<ServiceTab>;
    list(): Promise<ServiceTab[]>;
    getActive(): Promise<ServiceTab>;
  };
  tabLifecycle: {
    recordCreated(id: number): unknown;
    recordAcquired(id: number): unknown;
  };
  credentialObservationGate?: { hasManualSavingTab(id: number): boolean };
  nameSession(name: string): Promise<unknown>;
  cdp: { closeTab(id: number): Promise<unknown> };
}
/** Original BN. Uses its command-specific error rather than W. */
export const CloseTabCommand = defineCommand(
  "close_tab",
  async (payload: { tab_id: unknown }, context: TabCommandContext) => {
    const id = Number(payload.tab_id);
    if (!Number.isInteger(id) || id <= 0)
      throw new Error("close_tab requires a positive integer tab_id");
    await context.cdp.closeTab(id);
    return {};
  },
);
/** Original DN. */
export const CreateTabCommand = defineCommand(
  "create_tab",
  async (_payload: unknown, context: TabCommandContext) => {
    const tab = await context.tabs.create();
    context.tabLifecycle.recordCreated(tab.id);
    return { id: tab.id.toString() };
  },
);
/** Original Fh: the credential observation gate is checked independently for each field. */
export const GetTabCommand = defineCommand(
  "get_tab",
  async ({ tab_id }: { tab_id: unknown }, context: TabCommandContext) => {
    const tab = await context.tabs.get(positiveTabId(tab_id));
    if (tab.sessionControlled !== false)
      context.tabLifecycle.recordAcquired(tab.id);
    return {
      id: String(tab.id),
      ...(tab.title == null ||
      context.credentialObservationGate?.hasManualSavingTab(tab.id) === true
        ? {}
        : { title: tab.title }),
      ...(tab.url == null ||
      context.credentialObservationGate?.hasManualSavingTab(tab.id) === true
        ? {}
        : { url: tab.url }),
    };
  },
);
/** Original MN: listing does not acquire tabs. */
export const ListTabsCommand = defineCommand(
  "list_tabs",
  async (_payload: unknown, context: TabCommandContext) => ({
    tabs: (await context.tabs.list()).map((tab) => ({
      id: tab.id.toString(),
      providerTabId: tab.providerTabId,
      ...(tab.url == null ||
      context.credentialObservationGate?.hasManualSavingTab(tab.id) === true
        ? {}
        : { url: tab.url }),
      ...(tab.title == null ||
      context.credentialObservationGate?.hasManualSavingTab(tab.id) === true
        ? {}
        : { title: tab.title }),
    })),
  }),
);
/** Original NN. */
export const NameSessionCommand = defineCommand(
  "name_session",
  async (payload: { name: string }, context: TabCommandContext) => {
    const name = payload.name.trim();
    if (!name) throw new Error("name_session requires a name");
    await context.nameSession(name);
    return {};
  },
);
/** Original k2: failure in either selection or lifecycle recording yields an empty result. */
export const SelectedTabCommand = defineCommand(
  "selected_tab",
  async (_payload: unknown, context: TabCommandContext) => {
    try {
      const tab = await context.tabs.getActive();
      if (tab.sessionControlled !== false)
        context.tabLifecycle.recordAcquired(tab.id);
      return { id: tab.id.toString() };
    } catch {
      return {};
    }
  },
);
