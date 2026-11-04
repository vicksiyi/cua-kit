import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createTabGroupManagerClass } from "../packages/browser-extension/src/tab_groups";
function fixture(original: boolean, initial: unknown = undefined) {
  const trace: any[] = [],
    listeners: Function[] = [];
  let stored = structuredClone(initial),
    nextGroup = 10;
  const tabs = new Map(
    [1, 2, 3].map((id) => [id, { id, windowId: 8, groupId: -1 }]),
  );
  const groups = new Map<number, any>();
  const fail = {
    read: false,
    write: false,
    update: false,
    ungroup: false,
    query: false,
    getGroup: false,
  };
  const chrome: any = {
    storage: {
      local: {
        async get(key: string) {
          trace.push(["getStorage", key]);
          if (fail.read) throw Error("read failed");
          return { [key]: structuredClone(stored) };
        },
        async set(value: any) {
          trace.push(["setStorage", structuredClone(value)]);
          if (fail.write) throw Error("write failed");
          stored = structuredClone(value.TAB_GROUPS);
        },
      },
    },
    tabs: {
      async get(id: number) {
        trace.push(["getTab", id]);
        const tab = tabs.get(id);
        if (!tab) throw Error("missing tab");
        return { ...tab };
      },
      async query(options: any) {
        trace.push(["query", options]);
        if (fail.query) throw Error("query failed");
        return [...tabs.values()]
          .filter((tab) => tab.groupId === options.groupId)
          .map((tab) => ({ ...tab }));
      },
      async group(options: any) {
        trace.push(["group", options]);
        const id = options.groupId ?? nextGroup++;
        groups.set(id, { id });
        for (const tabId of [options.tabIds].flat())
          tabs.get(tabId)!.groupId = id;
        return id;
      },
      async ungroup(id: number) {
        trace.push(["ungroup", id]);
        if (fail.ungroup) throw Error("ungroup failed");
        tabs.get(id)!.groupId = -1;
      },
    },
    tabGroups: {
      onRemoved: {
        addListener(fn: Function) {
          trace.push(["listen"]);
          listeners.push(fn);
        },
      },
      async get(id: number) {
        trace.push(["getGroup", id]);
        if (fail.getGroup || !groups.has(id)) throw Error("missing group");
        return groups.get(id);
      },
      async update(id: number, value: any) {
        trace.push(["update", id, value]);
        if (fail.update) throw Error("update failed");
        Object.assign(groups.get(id), value);
      },
    },
  };
  const Class = original
    ? extensionBindings(["La", "vS", "Da", "bS"], {
        chrome,
        Math: { floor: Math.floor, random: () => 0.5 },
      }).bS
    : createTabGroupManagerClass({ chrome, random: () => 0.5 });
  return {
    Class,
    manager: Class.getInstance(),
    trace,
    tabs,
    groups,
    listeners,
    fail,
    chrome,
    get stored() {
      return stored;
    },
  };
}
async function outcome(run: () => any) {
  try {
    return { value: await run() };
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
  assert.deepEqual(await run(b), await run(a));
  assert.deepEqual(b.trace, a.trace);
  assert.deepEqual(b.stored, a.stored);
  assert.deepEqual(b.manager.managedGroupIds, a.manager.managedGroupIds);
  assert.deepEqual(b.manager.sessionGroupTitles, a.manager.sessionGroupTitles);
  return b;
}
test("tab group lifecycle matches original singleton, creation/reuse, titles and release", async () => {
  const f = await compare(async (f) => {
    assert.equal(f.Class.getInstance(), f.manager);
    await Promise.all([f.manager.ensureInit(), f.manager.ensureInit()]);
    await f.manager.setSessionGroupTitle("s", "  Research  ", []);
    await f.manager.ensureAgentTabGroup("s", 1, []);
    await f.manager.ensureAgentTabGroup("s", 2, [99, 1]);
    await f.manager.ensureAgentTabGroup("s", 2, [1]);
    await f.manager.setSessionGroupTitle("s", "   ", [1]);
    await f.manager.setSessionGroupTitle("s", null, [1]);
    await f.manager.releaseTabsFromManagedGroups([1, 1, 99]);
    await f.manager.releaseTabsFromManagedGroups([2]);
    await f.manager.refreshManagedGroupsFromChrome();
    return [...f.manager.managedGroupIds];
  });
  assert.equal(f.listeners.length, 1);
  assert.equal(f.trace.filter((e) => e[0] === "group").length, 2);
  assert.ok(
    f.trace.some(
      (e) =>
        e[0] === "update" &&
        e[2].color === "green" &&
        e[2].title === "Research",
    ),
  );
  assert.deepEqual(f.stored, { groups: [], sessionGroupTitles: {} });
});
test("tab groups retain legacy storage, cached init rejection and method-specific failures", async () => {
  for (const stored of [
    undefined,
    [null, { chromeGroupId: 5 }, { chromeGroupId: "bad" }],
    {
      groups: [{ chromeGroupId: 7 }],
      sessionGroupTitles: { s: " title ", bad: 9, empty: " " },
    },
    { groups: 9 },
  ])
    await compare(async (f) => outcome(() => f.manager.ensureInit()), stored);
  await compare(async (f) => {
    f.fail.read = true;
    const first = await outcome(() => f.manager.ensureInit());
    f.fail.read = false;
    return [first, await outcome(() => f.manager.ensureInit())];
  });
  await compare(async (f) => {
    f.fail.update = true;
    await f.manager.ensureAgentTabGroup("s", 1, []);
    f.fail.write = true;
    const title = await outcome(() =>
      f.manager.setSessionGroupTitle("s", "new", [1]),
    );
    f.fail.write = false;
    f.fail.ungroup = true;
    await f.manager.releaseTabsFromManagedGroups([1]);
    f.fail.query = true;
    const release = await outcome(() =>
      f.manager.releaseTabsFromManagedGroups([1]),
    );
    return [title, release];
  });
});
test("tab group removal, stale IDs and absent optional Chrome APIs match original", async () => {
  await compare(async (f) => {
    await f.manager.ensureAgentTabGroup("s", 1, []);
    f.listeners[0]({ id: 10 });
    await new Promise((resolve) => setImmediate(resolve));
    f.listeners[0]({ id: 10 });
    f.manager.managedGroupIds.add(55);
    await f.manager.refreshManagedGroupsFromChrome();
    assert.equal(await f.manager.removeManagedGroupIfEmpty(99), true);
    delete f.chrome.tabs.ungroup;
    delete f.chrome.tabGroups.update;
    await f.manager.ensureAgentTabGroup("s", 2, []);
    await f.manager.releaseTabsFromManagedGroups([2]);
    delete f.chrome.tabGroups;
    return await f.manager.findManagedGroupContainingTabs([2]);
  });
});
