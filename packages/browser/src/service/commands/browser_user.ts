import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
export interface BrowsingHistoryQuery {
  queries?: string[];
  limit?: number;
  from?: string;
  to?: string;
}
interface UserTab {
  id: number;
  providerTabId?: unknown;
  title?: unknown;
  url?: unknown;
  lastOpened?: unknown;
  tabGroup?: unknown;
}
interface BrowserUserContext {
  browserUser: {
    claimTab(tabId: number): Promise<UserTab>;
    getTabContext(tabId: number, url: unknown): Promise<unknown>;
    openTabs(): Promise<UserTab[]>;
  };
  tabLifecycle: { recordAcquired(tabId: number): unknown };
  security: { currentUserTabUrl(tabId: number): Promise<unknown> };
  acquireAuthority(): {
    observeContent(
      url: unknown,
      options: { bypassApproval: boolean },
    ): { assert(): Promise<unknown> };
    readBrowsingHistory(query: BrowsingHistoryQuery): {
      assert(): Promise<unknown>;
    };
  };
  history(
    query: BrowsingHistoryQuery,
  ): Promise<{ url: unknown; title?: unknown; dateVisited: unknown }[]>;
}
/** Original Gp: claim first, then record the returned tab ID. */
export const BrowserUserClaimTabCommand = defineCommand(
  "browser_user_claim_tab",
  async (payload: { tab_id: unknown }, context: BrowserUserContext) => {
    const tabId = positiveTabId(payload.tab_id),
      tab = await context.browserUser.claimTab(tabId);
    context.tabLifecycle.recordAcquired(tab.id);
    return {
      id: String(tab.id),
      ...(tab.title == null ? {} : { title: tab.title }),
      ...(tab.url == null ? {} : { url: tab.url }),
    };
  },
);
/** Original Vp. The original explicit bypassApproval option is retained. */
export const BrowserUserGetTabContextCommand = defineCommand(
  "browser_user_get_tab_context",
  async (payload: { tab_id: unknown }, context: BrowserUserContext) => {
    const tabId = positiveTabId(payload.tab_id),
      url = await context.security.currentUserTabUrl(tabId);
    await context
      .acquireAuthority()
      .observeContent(url, { bypassApproval: true })
      .assert();
    return await context.browserUser.getTabContext(tabId, url);
  },
);
/** Original W9: validate present fields without coercion, trimming or date-range ordering. */
export function browsingHistoryQuery(payload: {
  queries?: unknown;
  limit?: unknown;
  from?: unknown;
  to?: unknown;
}): BrowsingHistoryQuery {
  const query: BrowsingHistoryQuery = {};
  if (payload.queries != null) {
    if (!Array.isArray(payload.queries) || payload.queries.length === 0)
      throw new Error(
        "browser_user_history requires queries to be a non-empty array of strings",
      );
    const queries: string[] = [];
    for (const value of payload.queries) {
      if (typeof value !== "string")
        throw new Error(
          "browser_user_history requires queries to be a non-empty array of strings",
        );
      queries.push(value);
    }
    query.queries = queries;
  }
  if (payload.limit != null) {
    if (!Number.isInteger(payload.limit) || (payload.limit as number) <= 0)
      throw new Error(
        "browser_user_history requires limit to be a positive integer",
      );
    query.limit = payload.limit as number;
  }
  if (payload.from != null) {
    if (
      typeof payload.from !== "string" ||
      Number.isNaN(Date.parse(payload.from))
    )
      throw new Error("browser_user_history requires from to be a valid date");
    query.from = payload.from;
  }
  if (payload.to != null) {
    if (typeof payload.to !== "string" || Number.isNaN(Date.parse(payload.to)))
      throw new Error("browser_user_history requires to to be a valid date");
    query.to = payload.to;
  }
  return query;
}
/** Original rR: authorization receives the same normalized query as the provider. */
export const BrowserUserHistoryCommand = defineCommand(
  "browser_user_history",
  async (
    payload: Parameters<typeof browsingHistoryQuery>[0],
    context: BrowserUserContext,
  ) => {
    const query = browsingHistoryQuery(payload);
    await context.acquireAuthority().readBrowsingHistory(query).assert();
    return {
      items: (await context.history(query)).map((item) => ({
        url: item.url,
        ...(item.title == null ? {} : { title: item.title }),
        dateVisited: item.dateVisited,
      })),
    };
  },
);
/** Original nR, preserving empty and false metadata while omitting null/undefined. */
export const BrowserUserOpenTabsCommand = defineCommand(
  "browser_user_open_tabs",
  async (_payload: unknown, context: BrowserUserContext) => ({
    tabs: (await context.browserUser.openTabs()).map((tab) => ({
      id: String(tab.id),
      ...(tab.providerTabId == null
        ? {}
        : { providerTabId: tab.providerTabId }),
      ...(tab.title == null ? {} : { title: tab.title }),
      ...(tab.url == null ? {} : { url: tab.url }),
      ...(tab.lastOpened == null ? {} : { lastOpened: tab.lastOpened }),
      ...(tab.tabGroup == null ? {} : { tabGroup: tab.tabGroup }),
    })),
  }),
);
