import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createBrowserManagement,
  type BrowserManagementCall,
} from "../packages/browser-extension/src/browser_management";
const names = [
  "Hr",
  "PS",
  "xS",
  "MS",
  "$a",
  "Fa",
  "Qu",
  "LS",
  "ed",
  "DS",
  "NS",
  "US",
  "td",
  "$S",
  "rd",
  "FS",
  "BS",
  "jS",
  "qS",
  "HS",
  "GS",
  "nd",
  "zS",
  "VS",
  "id",
  "WS",
  "sd",
  "pi",
  "Wr",
  "Ba",
  "bt",
  "ad",
  "od",
  "cd",
  "ja",
  "qa",
  "ld",
  "ud",
  "KS",
  "ZS",
];
function fixture(fail: string = "") {
  let stored: any[] = [];
  const trace: any[] = [];
  const tabs = [
    {
      id: 1,
      windowId: 10,
      groupId: 3,
      index: 0,
      pinned: false,
      url: "https://fixture.invalid",
    },
    { id: 2, windowId: 20, groupId: -1, index: 0, pinned: true },
    { id: 4, windowId: 10, groupId: -1, incognito: true },
  ];
  const api: any = {};
  const define = (
    namespace: string,
    method: string,
    run: (...args: any[]) => any,
  ) => {
    (api[namespace] ??= {})[method] = async (...args: any[]) => {
      trace.push([namespace, method, structuredClone(args)]);
      if (fail === `${namespace}.${method}`) throw Error("fixture failure");
      return run(...args);
    };
  };
  define("tabs", "query", (options: any) =>
    tabs.filter(
      (tab) =>
        options.windowId === undefined || tab.windowId === options.windowId,
    ),
  );
  define("tabs", "get", (id: number) => {
    const tab = tabs.find((tab) => tab.id === id);
    if (!tab) throw Error("missing tab");
    return tab;
  });
  for (const method of ["update", "move", "remove", "ungroup"])
    define("tabs", method, () => undefined);
  define("tabs", "group", () => 3);
  define("tabGroups", "get", (id: number) => ({
    id,
    windowId: 10,
    shared: id === 9,
  }));
  define("tabGroups", "query", () => [
    { id: 3, windowId: 10, title: "group", color: "blue", collapsed: false },
  ]);
  for (const method of ["move", "update"])
    define("tabGroups", method, () => ({ id: 3 }));
  define("windows", "getAll", () => [
    { id: 10, type: "normal", incognito: false },
    { id: 20, type: "normal", incognito: false },
  ]);
  define("windows", "get", (id: number) => ({
    id,
    type: id === 99 ? "popup" : "normal",
    incognito: id === 98,
  }));
  define("windows", "create", () => ({ id: 30 }));
  define("windows", "update", () => ({ id: 10 }));
  define("bookmarks", "get", (id: string) => [
    {
      id,
      index: 0,
      parentId: "0",
      title: "bookmark",
      url: "https://fixture.invalid",
    },
  ]);
  for (const method of ["create", "update", "move", "remove"])
    define("bookmarks", method, () => ({ id: "7", other: "omitted" }));
  api.storage = {
    session: {
      async get(key: string) {
        trace.push(["storage", "get", key]);
        if (fail === "storage.get") throw Error("fixture failure");
        return { [key]: structuredClone(stored) };
      },
      async set(value: any) {
        trace.push(["storage", "set", structuredClone(value)]);
        if (fail === "storage.set") throw Error("fixture failure");
        stored = structuredClone(value.BROWSER_MANAGEMENT_AUDIT_TRAIL);
      },
    },
  };
  return { api, trace };
}
async function exercise(
  original: boolean,
  calls: BrowserManagementCall[],
  fail = "",
) {
  const { api, trace } = fixture(fail);
  const implementation = original
    ? extensionBindings(names, { chrome: api, Date: { now: () => 1000 } }, [
        "ed",
      ])
    : createBrowserManagement(api, () => 1000);
  const execute = original
    ? implementation.KS
    : implementation.executeBrowserManagement;
  const audit = original
    ? implementation.NS
    : implementation.getBrowserManagementAuditTrail;
  const results = [];
  for (const call of calls)
    try {
      results.push({ value: await execute(call) });
    } catch (error) {
      results.push({ error: (error as Error).message });
    }
  try {
    results.push({ audit: await audit() });
  } catch (error) {
    results.push({ error: (error as Error).message });
  }
  return { trace, results };
}
test("management dispatch, validation, snapshots and audit match pinned extension", async () => {
  const cases: BrowserManagementCall[] = [
    { namespace: "tabs", method: "group", args: [{ tabIds: [1] }] },
    { namespace: "tabs", method: "group", args: [{ tabIds: [1, 2] }] },
    { namespace: "tabs", method: "group", args: [{ tabIds: [1], groupId: 9 }] },
    { namespace: "tabs", method: "update", args: [1, { pinned: true }] },
    {
      namespace: "tabs",
      method: "update",
      args: [1, { url: "https://example.com" }],
    },
    {
      namespace: "tabs",
      method: "move",
      args: [[1], { windowId: 20, index: 0 }],
    },
    { namespace: "tabs", method: "remove", args: [1] },
    { namespace: "tabs", method: "remove", args: [4] },
    { namespace: "tabs", method: "remove", args: [[]] },
    { namespace: "tabs", method: "get", args: [1] },
    { namespace: "tabs", method: "get", args: [-1] },
    { namespace: "windows", method: "create", args: [] },
    { namespace: "windows", method: "create", args: [{ tabId: 1 }] },
    { namespace: "windows", method: "create", args: [{ tabId: 2 }] },
    { namespace: "windows", method: "create", args: [{ incognito: true }] },
    { namespace: "windows", method: "update", args: [99, { focused: true }] },
    {
      namespace: "windows",
      method: "update",
      args: [10, { state: "locked-fullscreen" }],
    },
    { namespace: "windows", method: "update", args: [10, { width: 800 }] },
    { namespace: "tabGroups", method: "update", args: [3, { title: "new" }] },
    { namespace: "tabGroups", method: "update", args: [9, { title: "new" }] },
    { namespace: "bookmarks", method: "create", args: [{ title: "folder" }] },
    {
      namespace: "bookmarks",
      method: "update",
      args: ["7", { url: "https://example.com" }],
    },
    {
      namespace: "bookmarks",
      method: "update",
      args: ["7", { url: "javascript:alert(1)" }],
    },
    { namespace: "bookmarks", method: "remove", args: ["7"] },
    { namespace: "__proto__", method: "get", args: [] },
    { namespace: "tabs", method: "toString", args: [] },
    { namespace: "bookmarks", method: "search", args: ["missing method"] },
  ];
  for (const call of cases)
    assert.deepEqual(
      await exercise(false, [call]),
      await exercise(true, [call]),
      JSON.stringify(call),
    );
  for (const fail of [
    "storage.get",
    "storage.set",
    "tabs.query",
    "tabs.remove",
  ])
    assert.deepEqual(
      await exercise(false, [cases[6]], fail),
      await exercise(true, [cases[6]], fail),
      fail,
    );
  assert.deepEqual(
    await exercise(false, Array(55).fill(cases[3])),
    await exercise(true, Array(55).fill(cases[3])),
  );
});
