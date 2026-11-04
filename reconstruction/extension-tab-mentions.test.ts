import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createTabMentionProviderClass,
  observeMentionInvalidations,
  searchBrowserTabs,
  isMentionTab,
  parseMentionFavicon,
  parseMentionQuery,
} from "../packages/browser-extension/src/tab_mentions";
const names = [
  "mc",
  "Op",
  "Rp",
  "us",
  "Pp",
  "gc",
  "_c",
  "ds",
  "vc",
  "Lp",
  "wS",
  "Ju",
  "fi",
  "yS",
  "Na",
  "SS",
  "ES",
  "TS",
  "Ua",
  "IS",
  "AS",
  "CS",
  "Xu",
  "kS",
  "RS",
  "OS",
  "Yu",
];
const icon = "data:image/png;base64,YWJj";
const tab = (id: number, extra = {}) =>
  ({
    id,
    windowId: 1,
    index: id,
    title: `Page ${id}`,
    url: `https://example.test/${id}`,
    lastAccessed: id,
    favIconUrl: "https://example.test/icon",
    ...extra,
  }) as chrome.tabs.Tab;
function fixture(original: boolean) {
  const trace: any[] = [],
    listeners = new Map<string, Set<Function>>();
  let stored: any = {},
    failIdentity = false;
  const state = {
    tabs: [] as chrome.tabs.Tab[],
    cache: new Map<number, unknown>(),
    reads: [] as {
      id: number;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }[],
  };
  const event = (key: string) => ({
    addListener(fn: Function) {
      trace.push(["add", key]);
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(fn);
    },
    removeListener(fn: Function) {
      trace.push(["remove", key]);
      listeners.get(key)?.delete(fn);
    },
  });
  const chrome: any = {
    tabs: { query: async () => state.tabs },
    storage: {
      session: {
        get: async (key: string) => {
          trace.push(["get", key]);
          if (failIdentity) throw Error("storage failed");
          return stored;
        },
        set: async (value: any) => {
          trace.push(["set", value]);
          stored = value;
        },
      },
    },
  };
  for (const key of [
    "onCreated",
    "onRemoved",
    "onReplaced",
    "onActivated",
    "onUpdated",
    "onMoved",
    "onAttached",
    "onDetached",
  ])
    chrome.tabs[key] = event(key);
  const instanceId = async () => {
    trace.push(["identity"]);
    return "profile";
  };
  const crypto = { randomUUID: () => "generation" };
  const favicons = {
    getCachedFaviconDataUrl: (id: number) => state.cache.get(id),
    readFaviconDataUrl: (id: number, url: string) => {
      trace.push(["read", id, url]);
      return new Promise((resolve, reject) =>
        state.reads.push({ id, resolve, reject }),
      );
    },
  };
  let timer: (() => void) | undefined;
  const setTimeout = ((fn: () => void, ms: number) => {
    trace.push(["timer", ms]);
    timer = fn;
    return 1;
  }) as any;
  const clearTimeout = ((id: number) => {
    trace.push(["clear", id]);
    timer = undefined;
  }) as any;
  const bindings = original
    ? extensionBindings(names, {
        chrome,
        crypto,
        Be: instanceId,
        setTimeout,
        clearTimeout,
      })
    : null;
  const Provider = original
    ? bindings.Xu
    : createTabMentionProviderClass({ chrome, crypto, instanceId });
  const provider = new Provider("test", favicons, () => trace.push(["start"]));
  return {
    provider,
    state,
    trace,
    listeners,
    failIdentity: (value: boolean) => {
      failIdentity = value;
    },
    setStored: (value: any) => {
      stored = value;
    },
    search: (options: any) =>
      original ? bindings.Ju(options) : searchBrowserTabs(chrome, options),
    observe: (notify: () => void) =>
      original
        ? bindings.kS(notify)
        : observeMentionInvalidations(
            { chrome, setTimeout, clearTimeout },
            notify,
          ),
    fire: (key: string, ...args: any[]) => {
      for (const listener of listeners.get(key) ?? []) listener(...args);
    },
    tick: () => {
      const fn = timer;
      timer = undefined;
      fn?.();
    },
  };
}
const drain = () => new Promise((resolve) => setImmediate(resolve));
test("tab mention search, guards, identity and caps match installed source", async () => {
  const source = extensionBindings(names, { chrome: {}, Be() {} });
  const tabs = [
    tab(1),
    tab(2, { url: "https://chatgpt.com./" }),
    tab(3, { url: "https://sub.chatgpt.com/" }),
    tab(4, { incognito: true }),
    tab(5, { title: "bad\ud800" }),
    tab(6, { url: "file:///x" }),
    tab(7, { index: -1 }),
    tab(8, { lastAccessed: NaN }),
    tab(1, { title: "duplicate" }),
    tab(9, { url: "https://notchatgpt.com/", title: "PAGE Test" }),
  ];
  for (const value of tabs) assert.equal(isMentionTab(value), source.Na(value));
  for (const value of [
    null,
    {},
    { query: "x", limit: 0 },
    { query: "x", limit: 1, extra: 1 },
    { query: "x", limit: 0.5 },
    { query: "x".repeat(501), limit: 3 },
  ])
    assert.deepEqual(parseMentionQuery(value), source._c(value));
  for (const value of [
    icon,
    "data:image/svg+xml;base64,YWJj",
    "data:image/png;base64,YQ=",
    "data:image/png;base64,YQ==",
    "",
    null,
  ])
    assert.equal(parseMentionFavicon(value), source.mc(value));
  const results = [];
  for (const original of [true, false]) {
    const f = fixture(original);
    f.state.tabs = tabs;
    f.state.cache.set(9, icon);
    const values = [
      await f.provider.getCapabilityInfo(),
      await f.provider.getUserTabs({ query: "", limit: 0 }),
      await f.provider.getUserTabs({
        query: "test page",
        limit: 1000,
        includeFavicons: false,
      }),
      await f.search({ limit: 0, includeIncognito: false }),
      await f.provider.getProviderTabId(9),
    ];
    f.state.tabs = Array.from({ length: 120 }, (_, i) => tab(i));
    const capped = await f.provider.getUserTabs({
      query: "",
      limit: 120,
      includeFavicons: false,
    });
    assert.equal(capped.length, 100);
    values.push(capped);
    results.push({ values, trace: f.trace });
  }
  assert.deepEqual(results[1], results[0]);
});
test("mention identity retries failures and retains valid stored generation verbatim", async () => {
  for (const original of [true, false]) {
    const f = fixture(original);
    f.failIdentity(true);
    await assert.rejects(f.provider.getIdentity(), /storage failed/);
    f.failIdentity(false);
    f.setStored({ browserTabMentionGeneration: " preserved " });
    const [a, b] = await Promise.all([
      f.provider.getIdentity(),
      f.provider.getIdentity(),
    ]);
    assert.deepEqual(a, b);
    assert.equal(a.generation, " preserved ");
    assert.equal(f.trace.filter((row) => row[0] === "get").length, 2);
    assert.equal(f.trace.filter((row) => row[0] === "set").length, 0);
  }
});
test("favicon warmups preserve concurrency, deduplication, updates and drained invalidation", async () => {
  const results = [];
  for (const original of [true, false]) {
    const f = fixture(original);
    f.state.tabs = Array.from({ length: 6 }, (_, i) => tab(i + 1));
    const candidates = await f.provider.getUserTabs({ query: "", limit: 10 });
    await f.provider.getUserTabs({ query: "", limit: 10 });
    assert.equal(f.state.reads.length, 4);
    const updates: any[] = [];
    const stop = f.provider.subscribeCandidateUpdates(
      candidates,
      (value: any) => updates.push(value),
    );
    f.provider.subscribeInvalidations(() => f.trace.push(["invalidate"]));
    await drain();
    f.state.reads[0].resolve(icon);
    await drain();
    assert.equal(f.state.reads.length, 5);
    f.state.reads[1].reject(Error("fixture"));
    await drain();
    assert.equal(f.state.reads.length, 6);
    for (const read of f.state.reads.slice(2))
      read.resolve(read.id % 2 ? icon : null);
    await drain();
    assert.equal(f.trace.filter((row) => row[0] === "invalidate").length, 1);
    assert.equal(f.provider.pendingFaviconReads.size, 0);
    // A candidate's URL must still match, and cached updates are asynchronous.
    const cached = f.provider.subscribeCandidateUpdates(
      candidates,
      (value: any) => updates.push(value),
    );
    f.state.cache.set(2, icon);
    f.fire(
      "onUpdated",
      2,
      { favIconUrl: "new" },
      tab(2, { url: "https://changed.test/" }),
    );
    await drain();
    cached();
    stop();
    const stopped = f.provider.subscribeCandidateUpdates(candidates, () => {
      throw Error("unsubscribed callback");
    });
    stopped();
    await drain();
    results.push({ updates, trace: f.trace });
  }
  assert.deepEqual(results[1], results[0]);
});
test("mention invalidation observer preserves event ordering, coalescing and cleanup", () => {
  const results = [];
  for (const original of [true, false]) {
    const f = fixture(original);
    const stop = f.observe(() => f.trace.push(["notify"]));
    f.fire("onUpdated", 1, { status: "loading" });
    f.fire("onCreated", tab(1));
    f.fire("onUpdated", 1, { title: "changed" });
    f.tick();
    f.fire("onMoved", 1);
    stop();
    f.tick();
    f.fire("onRemoved", 1);
    results.push(f.trace);
  }
  assert.deepEqual(results[1], results[0]);
});

test("restored mention router searches actual provider and streams warmed favicon candidates", async () => {
  const { createTabMentionMessageRouter } =
    await import("../packages/browser-extension/src/tab_mention_messages");
  const f = fixture(false);
  f.state.tabs = [tab(1), tab(2), tab(3)];
  const messages = new Set<Function>(),
    disconnects = new Set<Function>(),
    replies: any[] = [];
  const port: any = {
    name: "search_browser_tab_mentions",
    sender: {
      id: "extension",
      frameId: 0,
      origin: "https://chatgpt.com",
      url: "https://chatgpt.com/work",
      tab: { id: 3, windowId: 1 },
    },
    onMessage: {
      addListener: (fn: Function) => messages.add(fn),
      removeListener: (fn: Function) => messages.delete(fn),
    },
    onDisconnect: { addListener: (fn: Function) => disconnects.add(fn) },
    postMessage: (reply: any) => replies.push(reply),
    disconnect() {
      throw Error("unexpected disconnect");
    },
  };
  createTabMentionMessageRouter(f.provider, "prod", {
    id: "extension",
  }).handleConnect(port);
  for (const listener of [...messages])
    listener({ type: "search_browser_tab_mentions", query: "", limit: 2 });
  await drain();
  assert.deepEqual(
    replies[0].candidates.map((candidate: any) => candidate.id),
    [2, 1],
  );
  assert.equal(replies[0].candidates[0].providerTabId, '["generation","2"]');
  f.state.reads.find((read) => read.id === 2)!.resolve(icon);
  await drain();
  assert.equal(replies[1].candidates[0].faviconUrl, icon);
  for (const listener of disconnects) listener();
  for (const read of f.state.reads.filter((read) => read.id !== 2))
    read.resolve(icon);
  await drain();
  assert.equal(replies.length, 2);
  assert.equal(f.provider.faviconListeners.size, 0);
});
