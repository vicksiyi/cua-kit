import { get_browser_tabs } from "../get_browser_tabs";
import { parse_tab_mention, get_mentioned_browser_id } from "./tab_reference";
import type { create_bootstrap_emitter } from "./create_bootstrap_emitter";
import type * as T from "./types";
type Bootstrap = ReturnType<typeof create_bootstrap_emitter>;
type BrowserApi = Required<
  Pick<
    T.TinySkyAlt,
    | "browsers"
    | "getBrowser"
    | "createBrowserTab"
    | "getTab"
    | "listBrowsers"
    | "listTabs"
  >
>;
// External browser declarations are absent from the installed embedded browser bundle.
// This local structural type records fields accessed here, not a replacement provider implementation.
type ListedTab = {
  id: string;
  providerTabId?: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
};

export function create_browser_api(
  browsers: T.Browsers,
  bootstrap: Bootstrap,
): BrowserApi {
  async function selectBrowser(
    options?: T.BrowserOptions,
    url?: string,
  ): Promise<T.Browser> {
    let browser: T.Browser;
    if (options?.browser !== undefined)
      browser = await browsers.get(options.browser);
    else if (url !== undefined && browsers.getForUrl !== undefined)
      browser = await browsers.getForUrl(url);
    else if (browsers.getDefault !== undefined)
      browser = await browsers.getDefault();
    else {
      const first = (await browsers.list())[0];
      if (first === undefined) throw new Error("No browser is available.");
      browser = await browsers.get(first.id);
    }
    await bootstrap.load_browser_documentation(browser);
    return browser;
  }
  async function emitInitialState(
    tab: T.Tab,
    browser: T.Browser,
  ): Promise<T.Tab> {
    const state = await tab.getAXState({ disableDiffing: true, emit: false });
    await bootstrap.emit(state, { browser });
    return tab;
  }
  return {
    browsers,
    async getBrowser(options) {
      let id = options?.id;
      if (options?.extensionInstanceId !== undefined) {
        if (id !== undefined)
          throw new Error(
            "Specify either id or extensionInstanceId, not both.",
          );
        const matches = (await browsers.list()).filter(
          (browser: T.BrowserInfo) =>
            browser.type === "extension" &&
            browser.metadata?.extensionInstanceId ===
              options.extensionInstanceId,
        );
        if (matches.length === 0)
          throw new Error("The Chrome instance is unavailable.");
        if (matches.length !== 1)
          throw new Error(
            `Multiple browsers match the Chrome instance: ${JSON.stringify(matches)}`,
          );
        id = matches[0].id;
      }
      const url = options?.url;
      const normalized =
        url === undefined || URL.canParse(url) ? url : `https://${url}`;
      const browser = await selectBrowser({ browser: id }, normalized);
      await bootstrap.emit(undefined, { browser });
      return browser;
    },
    async createBrowserTab(browserId, url, options) {
      if (typeof browserId !== "string" || browserId.trim() === "")
        throw new Error(
          "createBrowserTab requires a browser ID. Select one with cua.getBrowser().",
        );
      const normalized =
        url === undefined || URL.canParse(url) ? url : `https://${url}`;
      const browser = await selectBrowser({ browser: browserId });
      if (browser.tabs.new === undefined)
        throw new Error(
          `Browser ${browser.browserId} does not support creating tabs.`,
        );
      if (options?.sessionName !== undefined) {
        if (typeof browser.nameSession !== "function")
          throw new Error(
            `Browser ${browser.browserId} does not support sessionName.`,
          );
        await browser.nameSession(options.sessionName);
      }
      if (options?.visible !== undefined) {
        if (browser.capabilities === undefined)
          throw new Error(
            `Browser ${browser.browserId} does not support visibility control.`,
          );
        const visibility = await browser.capabilities.get("visibility");
        await visibility.set(options.visible);
      }
      const tab = await browser.tabs.new();
      if (tab.goto !== undefined) {
        const target = normalized ?? "about:blank";
        const protocol = URL.parse(target)?.protocol;
        if (
          tab.ax !== undefined &&
          (protocol === "https:" || protocol === "http:")
        )
          await tab.goto(target, { prepareAccessibility: true });
        else await tab.goto(target);
      } else if (normalized !== undefined) {
        await tab.close?.();
        throw new Error(`Tab ${tab.id} does not support navigation.`);
      }
      return emitInitialState(tab, browser);
    },
    async getTab(reference, options) {
      let browser: T.Browser, managed: ListedTab[], matches: ListedTab[];
      if (typeof reference === "string") {
        if (reference === "")
          throw new Error("getTab requires a tab reference");
        browser = await selectBrowser(options);
        managed = await browser.tabs.list();
        matches = await findTabs({
          browser,
          managed,
          matches: (tab) =>
            tab.id === reference || tab.providerTabId === reference,
        });
      } else if ("mention" in reference) {
        const mention = parse_tab_mention(reference.mention);
        browser = await selectBrowser({
          browser: await get_mentioned_browser_id(browsers, mention),
        });
        if (
          options?.browser !== undefined &&
          (await browsers.get(options.browser)).browserId !== browser.browserId
        )
          throw new Error(
            "The requested browser does not match the tab mention's browser/profile.",
          );
        managed = await browser.tabs.list();
        matches = await findTabs({
          browser,
          managed,
          matches: (tab) => tab.providerTabId === mention.tab_id,
        });
        const first = matches[0];
        if (
          first !== undefined &&
          (first.title !== mention.title || first.url !== mention.url)
        )
          throw new Error(
            "Stale tab mention: the tab's title or URL has changed.",
          );
      } else {
        if (!URL.canParse(reference.url))
          throw new Error("getTab requires an absolute URL.");
        if (!options?.browser)
          throw new Error("getTab({ url }) requires an explicit browser.");
        browser = await selectBrowser(options);
        managed = await browser.tabs.list();
        const user: ListedTab[] = (await browser.user?.openTabs?.()) ?? [];
        const merged = new Map(
          [...user, ...managed].map((tab) => [tab.id, tab]),
        );
        matches = [...merged.values()].filter(
          (tab) => tab.url === reference.url,
        );
      }
      const selected = matches[0];
      if (selected === undefined)
        throw new Error(`Tab not found in browser ${browser.browserId}.`);
      if (matches.length !== 1) {
        const browserId = browser.browserId;
        throw new Error(
          `Multiple tabs match the reference in browser ${browserId}: ${JSON.stringify(matches.map((tab) => ({ ...tab, browserId })))}`,
        );
      }
      let tab: T.Tab;
      if (managed.some((item) => item.id === selected.id))
        tab = await browser.tabs.get(selected.id);
      else {
        if (browser.user?.claimTab === undefined)
          throw new Error(
            `Tab ${selected.id} cannot be claimed in browser ${browser.browserId}.`,
          );
        tab = await browser.user.claimTab(selected);
      }
      if (
        [
          "chrome://newtab",
          "chrome://newtab/",
          "chrome-extension://njkekoimnfiafpgdgahjjnmhckkfojea/newtab.html",
        ].includes(selected.url!)
      ) {
        const browserId = browser.browserId;
        await bootstrap.emit({ ...selected, browserId }, { browser });
        return tab;
      }
      return emitInitialState(tab, browser);
    },
    async listBrowsers(options) {
      const result = await browsers.list();
      await bootstrap.emit(result, options);
      return result;
    },
    async listTabs(options) {
      let browser: T.Browser | undefined, infos: Array<{ id: string }>;
      if (options?.browser !== undefined) {
        browser = await selectBrowser(options);
        infos = [{ id: browser.browserId }];
      } else infos = await browsers.list();
      const groups = await Promise.all(
        infos.map(async (info) => {
          const selected = browser ?? (await browsers.get(info.id));
          const tabs = await get_browser_tabs(selected),
            browserId = selected.browserId;
          return tabs.map((tab) => ({ ...tab, browserId }));
        }),
      );
      const result = groups.flat();
      await bootstrap.emit(result, { ...options, browser });
      return result;
    },
  };
}
async function findTabs(args: {
  browser: T.Browser;
  managed: ListedTab[];
  matches: (tab: ListedTab) => boolean;
}): Promise<ListedTab[]> {
  const direct = args.managed.filter(args.matches);
  if (direct.length !== 0) return direct;
  const user: ListedTab[] = (await args.browser.user?.openTabs?.()) ?? [];
  const merged = new Map<string, ListedTab>();
  for (const tab of user) merged.set(tab.id, tab);
  const providerIds = new Map(user.map((tab) => [tab.id, tab.providerTabId]));
  const enriched = args.managed.map((tab) => ({
    ...tab,
    providerTabId: tab.providerTabId ?? providerIds.get(tab.id),
  }));
  for (const tab of enriched) merged.set(tab.id, tab);
  return [...merged.values()].filter(args.matches);
}
