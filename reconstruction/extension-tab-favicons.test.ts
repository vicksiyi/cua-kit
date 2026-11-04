import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createTabFaviconManagerClass } from "../packages/browser-extension/src/tab_favicons";
function fixture(original: boolean, initial: any = { badges: {} }) {
  const trace: any[] = [],
    owners = new Map<number, string>(),
    callbacks = new Map<string, Set<Function>>();
  const tabs = new Map(
    [1, 2, 3].map((id) => [
      id,
      {
        id,
        active: false,
        windowId: 9,
        url: `https://site.test/${id}`,
        favIconUrl: "https://site.test/icon",
      },
    ]),
  );
  let stored = structuredClone(initial),
    timerId = 0;
  const fail = {
    write: false,
    fetch: false,
    changed: false,
    send: false,
    focused: true,
  };
  const event = (name: string) => {
    const listeners = new Set<Function>();
    callbacks.set(name, listeners);
    return {
      addListener(fn: Function) {
        trace.push(["listen+", name]);
        listeners.add(fn);
      },
      removeListener(fn: Function) {
        trace.push(["listen-", name]);
        listeners.delete(fn);
      },
    };
  };
  const storage = {
    async get(key: string) {
      trace.push(["getStorage", key]);
      return { [key]: structuredClone(stored) };
    },
    async set(value: any) {
      trace.push(["setStorage", structuredClone(value)]);
      if (fail.write) throw Error("write failed");
      stored = structuredClone(value.TAB_FAVICON_BADGES);
    },
  };
  const leases = {
    subscribeActiveTabLeaseChanges(fn: Function) {
      trace.push(["subscribe"]);
      callbacks.set("leases", new Set([fn]));
      return () => {
        trace.push(["unsubscribe"]);
        callbacks.get("leases")!.delete(fn);
      };
    },
    async ensureInit() {
      trace.push(["leases.init"]);
    },
    async getOwningSessionId(id: number) {
      trace.push(["owner", id]);
      return owners.get(id) ?? null;
    },
    mightHaveActiveTabLease(id: number) {
      return owners.has(id);
    },
  };
  const chrome: any = {
    runtime: { getURL: (path: string) => `chrome-extension://fixture${path}` },
    storage: { session: storage },
    tabs: {
      onActivated: event("active"),
      onUpdated: event("updated"),
      onRemoved: event("removed"),
      onReplaced: event("replaced"),
      async get(id: number) {
        trace.push(["tab", id]);
        const tab = tabs.get(id);
        if (!tab) throw Error("missing");
        return { ...tab };
      },
      async query(options: any) {
        trace.push(["query", options]);
        return [...tabs.values()].filter(
          (tab) => tab.active && tab.windowId === options.windowId,
        );
      },
      async sendMessage(id: number, message: any) {
        trace.push(["send", id, structuredClone(message)]);
        if (fail.send) throw Error("send failed");
        return { ok: true };
      },
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: event("focus"),
      async get(id: number) {
        trace.push(["window", id]);
        return { focused: fail.focused };
      },
    },
    scripting: {
      async executeScript(args: any) {
        trace.push(["inject", args]);
        return [];
      },
    },
  };
  const host: any = {
    chrome,
    tabLeases: { getInstance: () => leases },
    setTimeout(_fn: any, ms: number) {
      const id = ++timerId;
      trace.push(["timer", id, ms]);
      return id;
    },
    clearTimeout(id: number) {
      trace.push(["clear", id]);
    },
    async fetch(url: string, options: any) {
      trace.push(["fetch", url, options.credentials]);
      if (fail.fetch) throw Error("fetch failed");
      if (fail.changed) tabs.get(1)!.url = "https://changed.test";
      return new Response(Uint8Array.of(1, 2, 3), {
        headers: { "content-type": "image/png" },
      });
    },
  };
  const Class = original
    ? extensionBindings(
        [
          "dS",
          "hS",
          "xa",
          "Zu",
          "Ma",
          "fS",
          "pS",
          "mS",
          "gS",
          "_S",
          "Ea",
          "gy",
          "Mu",
          "Ta",
          "de",
          "_y",
          "rS",
          "Gu",
        ],
        {
          chrome,
          st: host.tabLeases,
          fetch: host.fetch,
          setTimeout: host.setTimeout,
          clearTimeout: host.clearTimeout,
        },
      ).Ma
    : createTabFaviconManagerClass(host);
  return {
    Class,
    manager: Class.getInstance(),
    trace,
    tabs,
    owners,
    fail,
    callbacks,
    get stored() {
      return stored;
    },
  };
}
async function drain(f: ReturnType<typeof fixture>) {
  await f.manager.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  await f.manager.stateOperationQueue;
  await f.manager.publicationQueue;
  await new Promise((resolve) => setImmediate(resolve));
}
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}
async function compare(
  run: (f: ReturnType<typeof fixture>) => Promise<unknown>,
  initial?: unknown,
) {
  const a = fixture(true, initial),
    b = fixture(false, initial);
  assert.deepEqual(
    Object.getOwnPropertyNames(b.Class.prototype),
    Object.getOwnPropertyNames(a.Class.prototype),
  );
  await drain(a);
  await drain(b);
  assert.deepEqual(await run(b), await run(a));
  await drain(a);
  await drain(b);
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(b.stored, a.stored);
  assert.deepEqual(
    b.manager.unseenFinalizedBadges,
    a.manager.unseenFinalizedBadges,
  );
  assert.deepEqual(b.manager.faviconDataUrls, a.manager.faviconDataUrls);
  assert.deepEqual(b.manager.closingTabIds, a.manager.closingTabIds);
  a.manager.dispose();
  b.manager.dispose();
  assert.deepEqual(b.trace, a.trace);
  assert.equal(b.Class.instance, null);
  return b;
}
test("favicon manager matches original badge state, active lease precedence, visibility and publication", async () => {
  const f = await compare(async (f) => {
    await f.manager.markFinalized(1, "deliverable");
    await drain(f);
    await f.manager.markFinalized(1, "deliverable");
    await drain(f);
    f.owners.set(1, "s");
    await f.manager.reconcileActiveTabLeaseChanges([1]);
    await drain(f);
    f.owners.delete(1);
    await f.manager.reconcileActiveTabLeaseChanges([1]);
    await drain(f);
    f.tabs.get(2)!.active = true;
    await f.manager.markFinalized(2, "handoff");
    await drain(f);
    f.fail.focused = false;
    await f.manager.markFinalized(2, "handoff");
    await drain(f);
    await f.manager.clearFocusedWindowFinalizedBadge(9);
    await drain(f);
    return await f.manager.hasUnseenFinalizedBadges();
  });
  assert.ok(
    f.trace.some((entry) => entry[0] === "send" && entry[2].badge === "active"),
  );
  assert.ok(
    f.trace.some(
      (entry) => entry[0] === "send" && entry[2].badge === "deliverable",
    ),
  );
});
test("favicon cache and event invalidation preserve navigation races, badge filtering, replacement and removal", async () => {
  await compare(async (f) => {
    f.fail.changed = true;
    assert.equal(await f.manager.readFaviconDataUrl(1), null);
    f.fail.changed = false;
    await f.manager.markFinalized(1, "handoff");
    await drain(f);
    f.manager.handleTabUpdated(1, { favIconUrl: "https://new/icon" });
    await drain(f);
    const badge =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg data-codex-favicon-badge="codex-favicon-badge"/>',
      );
    f.manager.handleTabUpdated(1, { favIconUrl: badge });
    await drain(f);
    f.manager.handleTabReplaced(3, 1);
    await drain(f);
    f.manager.handleTabRemoved(3);
    await drain(f);
    return [
      await f.manager.readFaviconDataUrl(99),
      await f.manager.readFaviconDataUrl(2, "https://wrong.test"),
    ];
  });
});
test("favicon storage and close failure semantics preserve mutated state and queue recovery", async () => {
  await compare(
    async (f) => {
      f.fail.write = true;
      const failed = await outcome(() =>
        f.manager.markFinalized(1, "deliverable"),
      );
      f.fail.write = false;
      await f.manager.clearFinalizedBadge(1);
      await drain(f);
      await f.manager.markFinalized(2, "handoff");
      await drain(f);
      const closed = await outcome(() =>
        f.manager.closeTabsWithFaviconRestore([2], async () => {
          throw Error("close failed");
        }),
      );
      assert.equal(f.manager.closingTabIds.has(2), false);
      const value = await f.manager.closeTabsWithFaviconRestore(
        [1],
        async () => 42,
      );
      await f.manager.publishBadge(1, "active");
      f.fail.send = true;
      await f.manager.publishBadge(2, "handoff");
      await drain(f);
      return { failed, closed, value };
    },
    {
      badges: {
        "2": "deliverable",
        "-1": "handoff",
        bad: "deliverable",
        "3": "active",
      },
    },
  );
});
