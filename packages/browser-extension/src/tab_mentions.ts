import { parseExtensionInstanceId, wellFormed } from "./instance_id";
export function parseMentionFavicon(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= 16384 &&
    /^data:image\/(?:avif|bmp|gif|jpeg|png|webp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      value,
    ) &&
    value.slice(value.indexOf(",") + 1).length % 4 === 0
    ? value
    : null;
}
export function parseMentionQuery(
  value: unknown,
): { query: string; limit: number } | null {
  const input =
    typeof value === "object" && value != null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : undefined;
  return input != null &&
    Object.keys(input).every((key) => ["query", "limit"].includes(key)) &&
    typeof input.query === "string" &&
    input.query.length <= 500 &&
    typeof input.limit === "number" &&
    Number.isSafeInteger(input.limit) &&
    input.limit >= 0
    ? { query: input.query, limit: input.limit }
    : null;
}
export function tabLastAccessed(tab: chrome.tabs.Tab) {
  const value = tab.lastAccessed;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}
export function isReadableTab(
  tab: chrome.tabs.Tab,
): tab is chrome.tabs.Tab & { id: number; url: string } {
  if (
    tab.incognito ||
    !(
      Number.isSafeInteger(tab.id) &&
      (tab.id ?? -1) >= 0 &&
      typeof tab.url === "string" &&
      tab.url.length <= 16384 &&
      wellFormed(tab.url)
    )
  )
    return false;
  try {
    const protocol = new URL(tab.url!).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
export function isMentionTab(
  tab: chrome.tabs.Tab,
): tab is chrome.tabs.Tab & { id: number; url: string } {
  if (
    !isReadableTab(tab) ||
    !(
      Number.isSafeInteger(tab.windowId) &&
      tab.windowId >= 0 &&
      Number.isSafeInteger(tab.index) &&
      tab.index >= 0 &&
      (tab.title == null || (tab.title.length <= 4096 && wellFormed(tab.title)))
    )
  )
    return false;
  const hostname = new URL(tab.url).hostname.replace(/\.$/, "");
  return hostname !== "chatgpt.com" && !hostname.endsWith(".chatgpt.com");
}
export function compareMentionTabs(a: chrome.tabs.Tab, b: chrome.tabs.Tab) {
  return (
    tabLastAccessed(b) - tabLastAccessed(a) ||
    (a.windowId ?? 0) - (b.windowId ?? 0) ||
    (a.index ?? 0) - (b.index ?? 0) ||
    (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)
  );
}
export async function searchBrowserTabs(
  chromeApi: Pick<typeof chrome, "tabs">,
  options: {
    urlProtocols?: string[];
    includeIncognito?: boolean;
    browserTabMentionsOnly?: boolean;
    query?: string;
    limit?: number;
    includeFavicons?: boolean;
    getFaviconDataUrl?: (
      tab: chrome.tabs.Tab & { id: number; url: string },
    ) => string | null;
  },
) {
  const protocols =
    options.urlProtocols == null ? null : new Set(options.urlProtocols);
  const tabs = (await chromeApi.tabs.query({}))
    .filter((tab) => Number.isSafeInteger(tab.id) && (tab.id ?? -1) >= 0)
    .filter((tab) => options.includeIncognito !== false || !tab.incognito)
    .filter(
      (tab) => options.browserTabMentionsOnly !== true || isMentionTab(tab),
    )
    .filter((tab) => {
      if (protocols != null) {
        if (typeof tab.url !== "string") return false;
        try {
          const protocol = new URL(tab.url).protocol;
          if (
            (protocol !== "http:" && protocol !== "https:") ||
            !protocols.has(protocol)
          )
            return false;
        } catch {
          return false;
        }
      }
      const haystack = `${tab.title ?? ""}\n${tab.url ?? ""}`.toLowerCase();
      return (options.query ?? "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => haystack.includes(term));
    })
    .sort(compareMentionTabs);
  const seen = new Set<number>();
  const result: { faviconUrl: string | null; tab: chrome.tabs.Tab }[] = [];
  const limit = options.limit ?? 1000;
  for (const tab of tabs) {
    if (seen.has(tab.id!)) continue;
    seen.add(tab.id!);
    result.push({
      faviconUrl:
        options.includeFavicons === true &&
        options.getFaviconDataUrl != null &&
        typeof tab.url === "string"
          ? options.getFaviconDataUrl({ ...tab, id: tab.id!, url: tab.url })
          : null,
      tab,
    });
    if (result.length === limit) break;
  }
  return result;
}
interface MentionIdentity {
  profileInstanceId: string;
  generation: string;
}
export function mentionProviderTabId(identity: MentionIdentity, tabId: number) {
  return JSON.stringify([identity.generation, String(tabId)]);
}
export interface MentionCandidate {
  id: number;
  browserId: string;
  faviconUrl: string | null;
  lastOpened: string;
  providerTabId: string;
  title: string;
  url: string;
}
interface FaviconProvider {
  getCachedFaviconDataUrl(id: number, url: string): unknown;
  readFaviconDataUrl(id: number, url: string): Promise<unknown>;
}
interface FaviconUpdate {
  tabId: number;
  pageUrl: string;
  faviconUrl: string;
}
/** Original Xu/RS/OS/Yu. Factory dependencies replace browser globals, not provider behavior. */
export function createTabMentionProviderClass(host: {
  chrome: Pick<typeof chrome, "tabs" | "storage">;
  crypto: Pick<Crypto, "randomUUID">;
  instanceId(): Promise<string>;
  queueMicrotask?: typeof queueMicrotask;
}) {
  return class TabMentionProvider {
    invalidationListeners = new Set<() => void>();
    faviconListeners = new Set<(update: FaviconUpdate) => void>();
    pendingFaviconReads = new Set<string>();
    faviconWarmupQueue: {
      pageUrl: string;
      pendingKey: string;
      tabId: number;
    }[] = [];
    activeFaviconWarmupCount = 0;
    faviconWarmupSucceeded = false;
    identityPromise: Promise<MentionIdentity> | null = null;
    constructor(
      public buildChannel: string,
      public faviconProvider: FaviconProvider = {
        getCachedFaviconDataUrl: () => null,
        readFaviconDataUrl: async () => null,
      },
      private startInvalidationObservation?: () => void,
    ) {}
    async getCapabilityInfo() {
      const { generation } = await this.getIdentity();
      return {
        protocolVersion: 1,
        buildChannel: this.buildChannel,
        generation,
      };
    }
    async getUserTabs(input: {
      limit: number;
      query: string;
      includeFavicons?: boolean;
    }) {
      this.ensureInvalidationObservationStarted();
      const query = parseMentionQuery({
        limit: input.limit,
        query: input.query,
      });
      if (query == null)
        throw new Error("Invalid Chrome tab mention search query");
      const identity = await this.getIdentity();
      const limit = Math.min(query.limit, 100);
      if (limit === 0) return [];
      const results = await searchBrowserTabs(host.chrome, {
        browserTabMentionsOnly: true,
        getFaviconDataUrl: (tab) => this.getFaviconDataUrl(tab),
        includeFavicons: input.includeFavicons !== false,
        includeIncognito: false,
        limit,
        query: query.query,
        urlProtocols: ["http:", "https:"],
      });
      return results.flatMap(({ faviconUrl, tab }) =>
        isMentionTab(tab)
          ? [
              {
                id: tab.id,
                browserId: identity.profileInstanceId,
                faviconUrl,
                lastOpened: new Date(tabLastAccessed(tab)).toISOString(),
                providerTabId: mentionProviderTabId(identity, tab.id),
                title: tab.title ?? "",
                url: tab.url,
              },
            ]
          : [],
      );
    }
    async getProviderTabId(tabId: number) {
      return mentionProviderTabId(await this.getIdentity(), tabId);
    }
    subscribeInvalidations(listener: () => void) {
      this.invalidationListeners.add(listener);
      return () => {
        this.invalidationListeners.delete(listener);
      };
    }
    subscribeCandidateUpdates(
      candidates: MentionCandidate[],
      listener: (candidates: MentionCandidate[]) => void,
    ) {
      const pending = new Map(
        candidates
          .filter((candidate) => candidate.faviconUrl == null)
          .map((candidate) => [candidate.id, candidate.url]),
      );
      const update = ({ tabId, pageUrl, faviconUrl }: FaviconUpdate) => {
        if (pending.get(tabId) !== pageUrl) return;
        pending.delete(tabId);
        candidates = candidates.map((candidate) =>
          candidate.id === tabId ? { ...candidate, faviconUrl } : candidate,
        );
        listener(candidates);
      };
      const onUpdated = (
        _id: number,
        change: chrome.tabs.OnUpdatedInfo,
        tab: chrome.tabs.Tab,
      ) => {
        if (
          change.favIconUrl === undefined ||
          !isMentionTab(tab) ||
          pending.get(tab.id) !== tab.url
        )
          return;
        const faviconUrl = this.getFaviconDataUrl(tab);
        if (faviconUrl != null)
          update({ tabId: tab.id, pageUrl: tab.url, faviconUrl });
      };
      this.faviconListeners.add(update);
      host.chrome.tabs.onUpdated.addListener(onUpdated);
      (host.queueMicrotask ?? queueMicrotask)(() => {
        for (const [tabId, pageUrl] of pending) {
          const faviconUrl = this.getCachedFaviconDataUrl(tabId, pageUrl);
          if (faviconUrl != null) update({ tabId, pageUrl, faviconUrl });
        }
      });
      return () => {
        pending.clear();
        this.faviconListeners.delete(update);
        host.chrome.tabs.onUpdated.removeListener(onUpdated);
      };
    }
    getFaviconDataUrl(tab: chrome.tabs.Tab & { id: number; url: string }) {
      const cached = this.getCachedFaviconDataUrl(tab.id, tab.url);
      this.loadFaviconDataUrl(tab, cached);
      return cached;
    }
    getCachedFaviconDataUrl(id: number, url: string) {
      try {
        return parseMentionFavicon(
          this.faviconProvider.getCachedFaviconDataUrl(id, url),
        );
      } catch {
        return null;
      }
    }
    loadFaviconDataUrl(
      tab: chrome.tabs.Tab & { id: number; url: string },
      cached: string | null,
    ) {
      const pendingKey = JSON.stringify([tab.id, tab.url]);
      if (
        cached != null ||
        typeof tab.favIconUrl !== "string" ||
        tab.favIconUrl.length === 0 ||
        this.pendingFaviconReads.has(pendingKey)
      )
        return;
      this.pendingFaviconReads.add(pendingKey);
      this.faviconWarmupQueue.push({
        pageUrl: tab.url,
        pendingKey,
        tabId: tab.id,
      });
      this.startQueuedFaviconWarmups();
    }
    startQueuedFaviconWarmups() {
      while (
        this.activeFaviconWarmupCount < 4 &&
        this.faviconWarmupQueue.length > 0
      ) {
        const item = this.faviconWarmupQueue.shift();
        if (item == null) continue;
        this.activeFaviconWarmupCount++;
        let read: Promise<unknown>;
        try {
          read = this.faviconProvider.readFaviconDataUrl(
            item.tabId,
            item.pageUrl,
          );
        } catch {
          read = Promise.resolve(null);
        }
        read
          .then((value) => {
            const faviconUrl = parseMentionFavicon(value);
            if (faviconUrl != null) {
              this.faviconWarmupSucceeded = true;
              for (const listener of this.faviconListeners)
                listener({
                  tabId: item.tabId,
                  pageUrl: item.pageUrl,
                  faviconUrl,
                });
            }
          })
          .catch(() => {})
          .finally(() => {
            this.pendingFaviconReads.delete(item.pendingKey);
            this.activeFaviconWarmupCount--;
            this.startQueuedFaviconWarmups();
            if (
              this.activeFaviconWarmupCount === 0 &&
              this.faviconWarmupQueue.length === 0 &&
              this.faviconWarmupSucceeded
            ) {
              this.faviconWarmupSucceeded = false;
              for (const listener of this.invalidationListeners) listener();
            }
          });
      }
    }
    getIdentity() {
      this.identityPromise ??= (async () => {
        const [profileInstanceId, stored] = await Promise.all([
          host.instanceId(),
          host.chrome.storage.session.get("browserTabMentionGeneration"),
        ]);
        const previous = stored.browserTabMentionGeneration;
        const generation =
          parseExtensionInstanceId(previous) ?? host.crypto.randomUUID();
        if (generation !== previous)
          await host.chrome.storage.session.set({
            browserTabMentionGeneration: generation,
          });
        return { profileInstanceId, generation };
      })().catch((error) => {
        this.identityPromise = null;
        throw error;
      });
      return this.identityPromise;
    }
    ensureInvalidationObservationStarted() {
      const start = this.startInvalidationObservation;
      this.startInvalidationObservation = undefined;
      start?.();
    }
  };
}
/** Original kS: trailing notification after the first event, not a reset-on-each-event debounce. */
export function observeMentionInvalidations(
  host: {
    chrome: Pick<typeof chrome, "tabs">;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  },
  notify: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer == null)
      timer = host.setTimeout(() => {
        timer = null;
        notify();
      }, 50);
  };
  const updated = (_id: number, change: chrome.tabs.OnUpdatedInfo) => {
    if (
      change.title !== undefined ||
      change.url !== undefined ||
      change.favIconUrl !== undefined
    )
      schedule();
  };
  const entries: [chrome.events.Event<any>, (...args: any[]) => void][] = [
    [host.chrome.tabs.onCreated, schedule],
    [host.chrome.tabs.onRemoved, schedule],
    [host.chrome.tabs.onReplaced, schedule],
    [host.chrome.tabs.onActivated, schedule],
    [host.chrome.tabs.onUpdated, updated],
    [host.chrome.tabs.onMoved, schedule],
    [host.chrome.tabs.onAttached, schedule],
    [host.chrome.tabs.onDetached, schedule],
  ];
  for (const [event, listener] of entries) event.addListener(listener);
  return () => {
    if (timer != null) {
      host.clearTimeout(timer);
      timer = null;
    }
    for (const [event, listener] of entries) event.removeListener(listener);
  };
}
