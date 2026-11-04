import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createBrowserTabsReader,
  createBrowserHistoryReader,
  createCursorAvailability,
  validateBrowserTabId,
  validateBrowserMouse,
} from "../packages/browser-extension/src/browser_queries";
const settle = async (fn: () => unknown) => {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error.message, name: error.name };
  }
};

test("browser history reader matches original query validation, ordering, deduplication and failures", async () => {
  const inputs: any[] = [
    {},
    { queries: ["a", "b"], limit: 2 },
    { queries: ["b", "a", "a"], from: "2020-01-01", to: "2025-12-31" },
    { limit: null, queries: null, from: null, to: null },
    { queries: [""] },
    { queries: [] },
    { queries: [1] },
    { queries: "a" },
    { limit: 0, from: "bad", queries: [] },
    { limit: -1 },
    { limit: 1.5 },
    { limit: "2" },
    { limit: Infinity },
    { from: 0 },
    { from: "bad" },
    { to: 0 },
    { to: "bad" },
    { from: "2025-01-01", to: "2020-01-01" },
    { queries: ["reject", "a"] },
    { queries: ["range"] },
    null,
  ];
  for (const input of inputs) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const chrome: any = {
        history: {
          search: async (query: any) => {
            trace.push(query);
            if (query.text === "reject") throw Error("search failed");
            if (query.text === "range")
              return [{ url: "range", lastVisitTime: 1e20 }];
            return query.text === "b"
              ? [
                  { url: "dup", title: "new", lastVisitTime: 3000 },
                  { url: "b", lastVisitTime: 2000 },
                ]
              : [
                  { url: "dup", title: "old", lastVisitTime: 1000 },
                  { url: "a", title: "", lastVisitTime: 2000 },
                  { url: "missing" },
                  { url: "nan", lastVisitTime: NaN },
                  { url: "infinite", lastVisitTime: Infinity },
                  { url: 7, lastVisitTime: 1 },
                  { url: "", lastVisitTime: 0 },
                  { url: "negative", title: null, lastVisitTime: -1 },
                ];
          },
        },
      };
      const original = extensionBindings(
        ["yE", "SE", "EE", "TE", "Cd", "IE", "AE"],
        { chrome },
      );
      const read = restored ? createBrowserHistoryReader(chrome) : original.yE;
      outputs.push({ result: await settle(() => read(input)), trace });
    }
    assert.deepEqual(outputs[1], outputs[0], JSON.stringify(input));
  }
});

test("cursor availability and argument validation retain original browser edge cases", async () => {
  const original = extensionBindings(["OE", "Xr", "RE"], {
    chrome: {
      tabs: { get: async () => ({}) },
      windows: { get: async () => ({}) },
    },
  });
  for (const id of [
    0,
    -1,
    1,
    2 ** 54,
    NaN,
    Infinity,
    1.2,
    "1",
    null,
    undefined,
  ]) {
    assert.deepEqual(
      await settle(() => validateBrowserTabId("test", id)),
      await settle(() => original.Xr("test", id)),
    );
    for (const x of [0, Infinity, NaN, "2", undefined]) {
      const request = { tabId: id, x, y: 0 };
      assert.deepEqual(
        await settle(() => validateBrowserMouse("move", request)),
        await settle(() => original.RE("move", request)),
      );
    }
  }
  for (const mode of [
    "normal",
    "unfocused",
    "inactive",
    "missing-window",
    "popup",
    "minimized",
    "tab-error",
    "window-error",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const chrome: any = {
        tabs: {
          get: async (id: number) => {
            trace.push(["tab", id]);
            if (mode === "tab-error") throw Error("tab");
            return {
              active: mode !== "inactive",
              windowId: mode === "missing-window" ? undefined : 1,
            };
          },
        },
        windows: {
          get: async (id: number) => {
            trace.push(["window", id]);
            if (mode === "window-error") throw Error("window");
            return {
              type: mode === "popup" ? "popup" : "normal",
              state: mode === "minimized" ? "minimized" : "normal",
              focused: mode !== "unfocused",
            };
          },
        },
      };
      const available = restored
        ? createCursorAvailability(chrome)
        : extensionBindings(["OE"], { chrome }).OE;
      outputs.push({ result: await available(4), trace });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});

test("user tabs reader preserves selection, group title enrichment and original failure boundaries", async () => {
  for (const mode of [
    "normal",
    "group-error",
    "query-error",
    "out-of-range-date",
  ]) {
    const outputs = [];
    for (const restored of [false, true]) {
      const trace: any[] = [];
      const chrome: any = {
        tabs: {
          query: async (query: any) => {
            trace.push(["query", query]);
            if (mode === "query-error") throw Error("query");
            return [
              {
                id: 1,
                title: "one",
                url: "https://one.test",
                lastAccessed: mode === "out-of-range-date" ? 1e20 : 1000,
                groupId: 2,
              },
              { id: 2, title: "two", lastAccessed: 2000, groupId: 2 },
              { id: 2, lastAccessed: 0, groupId: 3 },
              { id: 3, title: null, url: null, lastAccessed: -1, groupId: 3 },
              { id: 4, lastAccessed: NaN, groupId: -1 },
              { id: 5, lastAccessed: 0, groupId: 4, incognito: true },
              { id: -1, groupId: 5 },
            ];
          },
        },
        tabGroups: {
          get: async (id: number) => {
            trace.push(["group", id]);
            if (mode === "group-error" && id === 2) throw Error("group");
            return {
              title: id === 2 ? "  Group  " : id === 3 ? "   " : undefined,
            };
          },
        },
      };
      const original = extensionBindings(
        [
          "wE",
          "CE",
          "kE",
          "Ju",
          "fi",
          "yS",
          "Na",
          "SS",
          "ES",
          "TS",
          "wS",
          "Rp",
        ],
        { chrome },
      );
      outputs.push({
        result: await settle(() =>
          restored ? createBrowserTabsReader(chrome)() : original.wE(),
        ),
        trace,
      });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
