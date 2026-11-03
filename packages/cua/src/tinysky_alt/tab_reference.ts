import type * as T from "./types";
type TabMention = {
  source: "extension" | "iab";
  browser_id: string;
  tab_id: string;
  title: string;
  url: string;
};
export function parse_tab_mention(value: string): TabMention {
  const parsed = URL.parse(value);
  if (parsed === null) throw new Error("Invalid tab mention URL.");
  if (
    parsed.protocol !== "plugin:" ||
    parsed.host !== "openai-bundled" ||
    !["browser", "chrome", "chrome-dev", "chrome-internal"].includes(
      parsed.username,
    ) ||
    parsed.password !== "" ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.hash !== ""
  ) {
    throw new Error("Invalid tab mention URL.");
  }
  const fields = Object.fromEntries(parsed.searchParams);
  const { mention, source, browserId, tabId, title, url } = fields;
  const provider =
    parsed.username === "browser" ? (source ?? "iab") : "extension";
  if (
    mention !== "tab-v1" ||
    parsed.searchParams.size !== Object.keys(fields).length ||
    (provider !== "iab" && provider !== "extension") ||
    browserId === undefined ||
    browserId.trim() === "" ||
    tabId === undefined ||
    tabId.trim() === "" ||
    title === undefined ||
    url === undefined
  ) {
    throw new Error("Invalid tab mention fields.");
  }
  return { source: provider, browser_id: browserId, tab_id: tabId, title, url };
}
export async function get_mentioned_browser_id(
  browsers: T.Browsers,
  mention: TabMention,
): Promise<string> {
  const matches = (await browsers.list()).filter(
    (browser: T.BrowserInfo) =>
      browser.type === mention.source &&
      (mention.source === "iab" ||
        browser.metadata?.extensionInstanceId === mention.browser_id),
  );
  if (matches.length === 0)
    throw new Error(
      "The browser/profile referenced by the tab mention is unavailable.",
    );
  if (matches.length !== 1)
    throw new Error(
      `Multiple browsers match the tab mention's browser/profile: ${JSON.stringify(matches)}`,
    );
  return matches[0].id;
}
