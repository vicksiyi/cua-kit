import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createTabLeaseManagerClass } from "../packages/browser-extension/src/tab_leases";
const snapshot = (value: any): any =>
  value instanceof Map || value instanceof Set
    ? [...value].map(snapshot)
    : Array.isArray(value)
      ? value.map(snapshot)
      : value instanceof Error
        ? { error: value.message }
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, snapshot(v)]),
            )
          : value;
const outcome = async (run: () => any) => {
  try {
    return { value: snapshot(await run()) };
  } catch (error: any) {
    return { error: error.message };
  }
};
function fixture(original: boolean, seed: any = {}) {
  const trace: any[] = [],
    listeners: any = {};
  let stored = structuredClone(seed),
    tick = 100,
    rules: any[] = [];
  const state = {
    readFail: false,
    writeFail: false,
    dnrFail: false,
    instance: "instance:1",
    missingTabs: new Set<number>(),
  };
  const storage = {
    async get(key: string) {
      trace.push(["get", key]);
      if (state.readFail) throw Error("storage read failed");
      return { [key]: structuredClone(stored) };
    },
    async set(value: any) {
      trace.push(["set", snapshot(value)]);
      if (state.writeFail) throw Error("storage write failed");
      stored = structuredClone(value.TAB_LEASES);
    },
  };
  const chrome: any = {
    storage: { session: storage },
    runtime: { id: "extension" },
    tabs: {
      onRemoved: {
        addListener(fn: any) {
          trace.push(["listen", "removed"]);
          listeners.removed = fn;
        },
      },
      onReplaced: {
        addListener(fn: any) {
          trace.push(["listen", "replaced"]);
          listeners.replaced = fn;
        },
      },
      async get(id: number) {
        trace.push(["tab", id]);
        if (state.missingTabs.has(id)) throw Error("missing");
        return { id, url: "https://fixture.test" };
      },
      async query(options: any) {
        trace.push(["query", options]);
        return [1, 2, 3, 4, 5]
          .filter((id) => !state.missingTabs.has(id))
          .map((id) => ({ id }));
      },
    },
    declarativeNetRequest: {
      ResourceType: {
        MAIN_FRAME: "main_frame",
        SUB_FRAME: "sub_frame",
        OBJECT: "object",
      },
      RuleActionType: { MODIFY_HEADERS: "modifyHeaders" },
      HeaderOperation: { SET: "set" },
      async getSessionRules() {
        trace.push(["rules.get"]);
        return rules;
      },
      async updateSessionRules(value: any) {
        trace.push(["rules.set", snapshot(value)]);
        if (state.dnrFail) throw Error("DNR failed");
        rules = value.addRules;
      },
    },
  };
  const host = {
    chrome,
    async instanceId() {
      trace.push(["instance"]);
      return state.instance;
    },
    now() {
      return tick++;
    },
    error(...args: any[]) {
      trace.push(["error", ...args]);
    },
  };
  const Class = original
    ? extensionBindings(
        [
          "st",
          "vy",
          "ui",
          "Lu",
          "by",
          "wy",
          "yy",
          "Du",
          "Sy",
          "Ey",
          "Ty",
          "Iy",
          "Ay",
          "hc",
          "Cp",
          "cs",
          "ls",
          "Sr",
        ],
        {
          chrome,
          Date: { now: host.now },
          Be: host.instanceId,
          console: { error: host.error },
        },
      ).st
    : createTabLeaseManagerClass(host);
  const manager = new Class();
  return {
    manager,
    Class,
    state,
    trace,
    listeners,
    chrome,
    host,
    get stored() {
      return stored;
    },
  };
}
async function compare(
  run: (f: ReturnType<typeof fixture>) => Promise<any>,
  seed?: any,
) {
  const a = fixture(true, seed),
    b = fixture(false, seed);
  assert.deepEqual(
    Object.getOwnPropertyNames(b.Class.prototype),
    Object.getOwnPropertyNames(a.Class.prototype),
  );
  assert.deepEqual(await run(b), await run(a));
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(snapshot(b.manager.leases), snapshot(a.manager.leases));
  assert.deepEqual(
    snapshot(b.manager.pendingViewportSizes),
    snapshot(a.manager.pendingViewportSizes),
  );
  assert.deepEqual(b.stored, a.stored);
  assert.deepEqual(Object.keys(b.manager), Object.keys(a.manager));
}
test("extension lease manager preserves claims, cached initialization, marks, headers and handoff transitions", async () => {
  await compare(async ({ manager: m, state, Class }) => {
    const results = [m.mightHaveActiveTabLease(1)],
      events: any[] = [];
    const off = m.subscribeActiveTabLeaseChanges((ids: number[]) => {
      events.push(ids);
    });
    await m.ensureInit();
    results.push(m.mightHaveActiveTabLease(1));
    await m.claimTab("s", "t", 1, "agent", true);
    await m.claimTab("s", "t", 1, "agent", false);
    results.push(
      await m.getOwningSessionId(1),
      await m.getActiveLease(1),
      await m.isClaimedBySession("s", 1),
      await outcome(() => m.claimTab("other", "t", 1, "user")),
    );
    await m.setSessionRequestHeaders("s", [
      { name: "X-Session", value: "{{session_id}}" },
    ]);
    await m.setSessionRequestHeaderEnabled("s", false);
    const lease = await m.getActiveLease(1);
    results.push(
      await m.claimTabIfSourceLeaseMatches({ ...lease, turnId: "wrong" }, 2),
      await m.claimTabIfSourceLeaseMatches(lease, 2),
      await m.claimTabIfSourceLeaseMatches(lease, 2),
    );
    await m.setTabMark("s", "t", 1, "handoff");
    await m.replaceTurnMarks("s", "t", new Map([[2, "deliverable"]]));
    state.instance = "instance:2";
    await m.updateActiveSessionTurn("s", "t");
    results.push(await m.getActiveLease(2));
    await m.updateActiveSessionTurn("s", "next");
    await m.handoffTabs("s", "next", [1, 2, 2, 99], { activeTabId: 2 });
    results.push(
      await m.getSessionHandoffLeases("s"),
      await m.getOwningSessionId(1),
    );
    results.push(
      await m.resumeHandoffTabs("s", "again", [1, 2, 99]),
      await m.resumeHandoffTabs("s", "again", []),
    );
    await m.setSessionRequestHeaders("s", undefined, true);
    await m.setSessionRequestHeaderEnabled("s", false);
    await m.reconcileRequestHeaders();
    await m.releaseTabs("other", [1]);
    await m.releaseActiveTurn("s", "again");
    off();
    results.push(events, Class.getInstance() === Class.getInstance());
    return results;
  });
});
test("extension lease manager preserves pending viewport consumption, stale tabs and event mutations", async () => {
  await compare(async ({ manager: m, state, listeners }) => {
    const results = [];
    await m.setViewportSize("s", "t", null, { height: 600, width: 800 });
    await m.claimTab("s", "t", 1, "user");
    results.push(
      await m.takeViewportSizeForAttach("s", "wrong", 1),
      await m.takeViewportSizeForAttach("s", "t", 1),
    );
    await m.setViewportSize("s", "t", 1, null);
    results.push(await m.takeViewportSizeForAttach("s", "t", 1));
    results.push(
      await outcome(() => m.setViewportSize("other", "t", 1, null)),
      await outcome(() => m.takeViewportSizeForAttach("s", "t", 99)),
      await outcome(() => m.setTabMark("s", "wrong", 1, "handoff")),
    );
    await m.setViewportSize("s", "t", null, null);
    await m.clearPendingViewportSize("s", "wrong");
    await m.clearPendingViewportSize("s", "t");
    await m.claimTab("s", "t", 2, "agent");
    state.missingTabs.add(2);
    results.push(await m.getSessionTabs("s"));
    listeners.replaced(3, 1);
    await m.getSessionActiveLeases("s");
    results.push(await m.getActiveLease(3));
    listeners.removed(3);
    await m.getSessionActiveLeases("s");
    results.push(await m.getActiveLease(3));
    await m.replaceTab(5, 99);
    await m.removeTab(99);
    return results;
  });
});
test("extension lease rollback and DNR failures retain original persistence and error propagation boundaries", async () => {
  await compare(async ({ manager: m, state }) => {
    const results = [];
    await m.claimTab("s", "t", 1, "agent");
    state.writeFail = true;
    results.push(
      await outcome(() => m.claimTab("s", "t", 2, "user")),
      snapshot(m.leases),
    );
    state.writeFail = false;
    await m.claimTab("s", "t", 2, "user");
    state.dnrFail = true;
    results.push(
      await outcome(() => m.setSessionRequestHeaderEnabled("s", true)),
      snapshot(m.leases),
    );
    results.push(
      await outcome(() => m.claimTab("s", "t", 3, "agent")),
      await outcome(() => m.claimTab("s", "t", 4, "agent", false)),
    );
    await m.handoffTabs("s", "t", [1], {});
    results.push(await outcome(() => m.resumeHandoffTabs("s", "next", [1])));
    results.push(await outcome(() => m.reconcileRequestHeaders()));
    state.dnrFail = false;
    await m.reconcileRequestHeaders();
    results.push(
      await outcome(() =>
        m.mutate(() => {
          m.pendingViewportSizes.set("oops", {
            turnId: "t",
            viewportSize: null,
          });
          throw Error("mutation failed");
        }),
      ),
      snapshot(m.pendingViewportSizes),
    );
    return results;
  });
});
test("extension lease storage startup restores decoded values and caches initialization failures", async () => {
  const seed = {
    leases: {
      "1": {
        tabId: 1,
        sessionId: "s",
        turnId: "t",
        origin: "agent",
        claimedAt: 0,
        instanceId: null,
        state: "active",
        requestHeaderEnabled: true,
      },
      bad: {},
    },
    pendingViewportSizes: { s: { turnId: "t", viewportSize: null } },
  };
  await compare(async ({ manager: m }) => {
    const events: any[] = [];
    m.subscribeActiveTabLeaseChanges((ids: any) => {
      events.push(ids);
    });
    await Promise.all([m.ensureInit(), m.ensureInit()]);
    return [
      await m.getActiveLease(1),
      snapshot(m.pendingViewportSizes),
      events,
    ];
  }, seed);
  await compare(async ({ manager: m, state }) => {
    state.readFail = true;
    const first = await outcome(() => m.ensureInit());
    state.readFail = false;
    return [first, await outcome(() => m.ensureInit()), m.storageLoaded];
  });
});
