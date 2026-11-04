import { searchBrowserTabs, tabLastAccessed } from "./tab_mentions";
/** Original Xr/RE; tab ids intentionally use integer, not positive/safe-integer validation. */
export function validateBrowserTabId(method: string, tabId: unknown) {
  if (!Number.isInteger(tabId))
    throw new Error(`${method} requires an integer tabId`);
}
export function validateBrowserMouse(
  method: string,
  request: { tabId: unknown; x: unknown; y: unknown },
) {
  validateBrowserTabId(method, request.tabId);
  if (!Number.isFinite(request.x) || !Number.isFinite(request.y))
    throw new Error(`${method} requires finite x and y coordinates`);
}
/** Original OE: focus is not checked; background/minimized/non-normal tabs cannot animate. */
export function createCursorAvailability(
  chrome: Pick<typeof globalThis.chrome, "tabs" | "windows">,
) {
  return async (tabId: number) => {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return false;
    }
    if (tab.active !== true || typeof tab.windowId !== "number") return false;
    try {
      const window = await chrome.windows.get(tab.windowId);
      return window.type === "normal" && window.state !== "minimized";
    } catch {
      return false;
    }
  };
}
function historyLimit(value: unknown) {
  if (value == null) return 100;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new Error("getUserHistory requires limit to be a positive integer");
  return value;
}
function historyDate(value: unknown, field: string) {
  if (value == null) return;
  if (typeof value !== "string")
    throw new Error(`getUserHistory requires ${field} to be a valid date`);
  const result = Date.parse(value);
  if (Number.isNaN(result))
    throw new Error(`getUserHistory requires ${field} to be a valid date`);
  return result;
}
function historyQueries(request: { queries?: unknown }) {
  if (request.queries == null) return [""];
  const error = () =>
    new Error(
      "getUserHistory requires queries to be a non-empty array of strings",
    );
  if (!Array.isArray(request.queries) || request.queries.length === 0)
    throw error();
  const queries: string[] = [];
  for (const query of request.queries) {
    if (typeof query !== "string") throw error();
    queries.push(query);
  }
  return queries;
}
/** Original yE/SE/EE/TE/Cd/IE/AE. Query in parallel, sort newest first, then dedupe by URL and limit. */
export function createBrowserHistoryReader(
  chrome: Pick<typeof globalThis.chrome, "history">,
) {
  return async (request: {
    limit?: unknown;
    from?: unknown;
    to?: unknown;
    queries?: unknown;
  }) => {
    const limit = historyLimit(request.limit);
    const query: chrome.history.HistoryQuery = { text: "", maxResults: limit };
    const from = historyDate(request.from, "from") ?? 0;
    const to = historyDate(request.to, "to");
    query.startTime = from;
    if (to != null) query.endTime = to;
    const results = await Promise.all(
      historyQueries(request).map(
        async (text) => await chrome.history.search({ ...query, text }),
      ),
    );
    const entries = results
      .flatMap((items) =>
        items.flatMap((item) => {
          const url = item.url,
            visited = item.lastVisitTime;
          if (
            typeof url !== "string" ||
            typeof visited !== "number" ||
            !Number.isFinite(visited)
          )
            return [];
          return [
            {
              url,
              ...(item.title == null ? {} : { title: item.title }),
              dateVisited: new Date(visited).toISOString(),
            },
          ];
        }),
      )
      .sort((left, right) => right.dateVisited.localeCompare(left.dateVisited));
    const seen = new Set<string>();
    return entries
      .filter(({ url }) => (seen.has(url) ? false : (seen.add(url), true)))
      .slice(0, limit);
  };
}

/** Original wE/CE/kE, sharing the restored Ju/fi selection and last-access semantics. */
export function createBrowserTabsReader(
  chrome: Pick<typeof globalThis.chrome, "tabs" | "tabGroups">,
) {
  return async () => {
    const selected = await searchBrowserTabs(chrome, {});
    const ids = new Set<number>();
    for (const { tab } of selected)
      if (typeof tab.groupId === "number" && tab.groupId !== -1)
        ids.add(tab.groupId);
    const groups = await Promise.all(
      [...ids].map(async (id) => {
        try {
          const title = (await chrome.tabGroups.get(id)).title?.trim();
          return title ? ([id, title] as const) : null;
        } catch {
          return null;
        }
      }),
    );
    const titles = new Map(groups.filter((entry) => entry != null));
    return selected.map(({ tab }) => {
      const accessed = tabLastAccessed(tab);
      const group =
        typeof tab.groupId === "number" ? titles.get(tab.groupId) : undefined;
      return {
        id: tab.id,
        ...(tab.title == null ? {} : { title: tab.title }),
        ...(tab.url == null ? {} : { url: tab.url }),
        ...(accessed <= 0
          ? {}
          : { lastOpened: new Date(accessed).toISOString() }),
        ...(group == null ? {} : { tabGroup: group }),
      };
    });
  };
}
