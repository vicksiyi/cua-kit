import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createTabRuntime,
  toBrowserTabInfo,
} from "../packages/browser-extension/src/tab_runtime";
const outcome = async (run: () => any) => {
  try {
    return { value: await run() };
  } catch (error: any) {
    return { error: error.message };
  }
};
function fixture(original: boolean, config: any) {
  const trace: any[] = [];
  let windowRead = 0,
    createRead = 0,
    tabRead = 0,
    now = 0;
  const chrome: any = {
    windows: {
      async getAll(options: any) {
        trace.push(["windows", options]);
        return config.windows?.[windowRead++] ?? config.windows?.at(-1) ?? [];
      },
      async create(options: any) {
        trace.push(["window.create", options]);
        if (config.windowError) throw Error(config.windowError);
        return config.createdWindow;
      },
    },
    tabs: {
      async create(options: any) {
        trace.push(["tab.create", options]);
        const result =
          config.createdTabs?.[createRead++] ??
          config.createdTabs?.at(-1) ??
          {};
        if (result.error) throw Error(result.error);
        return result;
      },
      async get(id: number) {
        trace.push(["tab.get", id]);
        const result = config.tabs?.[tabRead++] ?? config.tabs?.at(-1) ?? {};
        if (result.error) throw Error(result.error);
        return result;
      },
      async update(id: number, options: any) {
        trace.push(["tab.update", id, options]);
        if (config.updateError) throw Error(config.updateError);
        return config.updatedTab;
      },
    },
  };
  const host: any = {
    chrome,
    now: () => now,
    setTimeout(fn: any, ms: number) {
      trace.push(["timer", ms]);
      now += config.tickMs ?? ms;
      fn();
      return 1;
    },
  };
  let runtime: any;
  if (original) {
    const old = extensionBindings(
      ["vE", "yt", "Id", "Ad", "za", "bE", "wi", "Jr"],
      {
        chrome,
        Date: { now: host.now },
        setTimeout: host.setTimeout,
        or: "about:blank",
        dE: 5000,
        hE: 25,
      },
    );
    runtime = {
      createTab: old.vE,
      getTab: old.yt,
      selectWindow: old.Id,
      createWindowAndTab: old.Ad,
      createInWindow: old.za,
      prepareNewTab: old.bE,
    };
  } else runtime = createTabRuntime(host);
  return { runtime, trace };
}
async function compare(config: any, run: (runtime: any) => any) {
  const a = fixture(true, config),
    b = fixture(false, config);
  assert.deepEqual(
    await outcome(() => run(b.runtime)),
    await outcome(() => run(a.runtime)),
  );
  assert.deepEqual(b.trace, a.trace);
  return b.trace;
}
test("extension tab creation preserves window preference and the original narrow retry boundary", async () => {
  const tab = {
    id: 10,
    title: "blank",
    url: "about:blank",
    active: false,
    favIconUrl: "icon",
  };
  for (const preferred of [undefined, 0, 1, 9])
    await compare(
      {
        windows: [[{ id: 0 }, { id: 1, focused: true }, { id: 9 }]],
        createdTabs: [tab],
      },
      (runtime) => runtime.createTab(preferred),
    );
  for (const config of [
    { windows: [[]], createdWindow: { id: 2, tabs: [{}, tab] } },
    { windows: [[]], createdWindow: { id: 2, tabs: [] }, createdTabs: [tab] },
    { windows: [[]], createdWindow: {} },
    {
      windows: [[{ id: 1 }], [{ id: 2, focused: true }]],
      createdTabs: [{ error: "disappeared" }, tab],
    },
    {
      windows: [[{ id: 1 }], []],
      createdTabs: [{ error: "disappeared" }],
      createdWindow: { tabs: [tab] },
    },
    {
      windows: [[{ id: 1 }], [{ id: 1 }]],
      createdTabs: [{ error: "same window" }],
    },
    {
      windows: [[{ id: 2 }], [{ id: 3 }]],
      createdTabs: [{ error: "not preferred" }],
    },
    { windows: [[{ id: 1 }], [{ id: 2 }]], createdTabs: [{}, tab] },
    {
      windows: [[{ id: 1 }], [{ id: 2 }]],
      createdTabs: [{ error: "first" }, { error: "second" }],
    },
  ])
    await compare(config, (runtime) => runtime.createTab(1));
  const noRetry = await compare(
    {
      windows: [[{ id: 2 }], [{ id: 3 }]],
      createdTabs: [{ error: "not preferred" }],
    },
    (runtime) => runtime.createTab(1),
  );
  assert.equal(noRetry.filter((entry) => entry[0] === "windows").length, 1);
});
test("extension new-tab preparation preserves navigation polling, timeout and malformed tab results", async () => {
  const pending = { id: 1, url: "chrome://newtab/" },
    blank = { id: 1, url: "about:blank" };
  for (const config of [
    { updatedTab: blank },
    { updatedTab: null },
    { updatedTab: {} },
    { updateError: "permission" },
    { updatedTab: pending, tabs: [blank] },
    { updatedTab: pending, tabs: [pending, blank] },
    { updatedTab: pending, tabs: [pending], tickMs: 2500 },
    { updatedTab: pending, tabs: [pending, blank], tickMs: 5000 },
    { updatedTab: pending, tabs: [{ error: "removed" }] },
    { updatedTab: pending, tabs: [{}] },
  ])
    await compare(config, (runtime) => runtime.prepareNewTab(1));
  const success = await compare(
    { updatedTab: pending, tabs: [pending, blank] },
    (runtime) => runtime.prepareNewTab(1),
  );
  assert.deepEqual(success, [
    ["tab.update", 1, { url: "about:blank" }],
    ["tab.get", 1],
    ["timer", 25],
    ["tab.get", 1],
  ]);
});
test("extension tab getters and metadata preserve original undefined-only id checks and field shape", async () => {
  const original = extensionBindings(["Jr"], {});
  for (const tab of [
    {},
    { id: 0 },
    { id: null },
    {
      id: 1,
      title: "title",
      favIconUrl: "icon",
      active: false,
      url: "about:blank",
      ignored: true,
    },
  ]) {
    assert.deepEqual(toBrowserTabInfo(tab as any), original.Jr(tab));
    await compare({ tabs: [tab] }, (runtime) => runtime.getTab(1));
  }
});
