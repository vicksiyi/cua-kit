import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import { createSidePanelActions } from "../packages/browser-extension/src/side_panel_actions";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const sender: any = {
  id: "extension",
  frameId: 0,
  origin: "https://chatgpt.com",
  url: "https://chatgpt.com/work",
  tab: { id: 4, windowId: 2 },
};
function fixture(upstream: boolean) {
  const trace: any[] = [],
    listeners: Function[] = [];
  const state = {
    gate: undefined as Promise<void> | undefined,
    failOpen: false,
    failStore: false,
  };
  const chrome: any = {
    runtime: { id: "extension" },
    sidePanel: { open() {} },
    storage: {
      session: {
        async set(value: any) {
          trace.push(["store", value]);
          if (state.failStore) throw Error("store");
        },
      },
    },
    contextMenus: {
      create(value: any) {
        trace.push(["menu", value]);
      },
      onClicked: {
        addListener(fn: Function) {
          listeners.push(fn);
        },
      },
    },
  };
  const open = async (...args: any[]) => {
    trace.push(["open", ...args]);
    await state.gate;
    if (state.failOpen) throw Error("open");
  };
  const original = upstream
    ? extensionBindings(
        [
          "Xt",
          "hm",
          "fm",
          "Nc",
          "_s",
          "cn",
          "Fk",
          "Mf",
          "xk",
          "Bf",
          "Mk",
          "Lk",
        ],
        {
          chrome,
          qf: open,
          Date: { now: () => 123 },
          Ep: "browser_side_chat_prompt_prefill",
          Sp: 80000,
          $f: "ask-chatgpt",
        },
      )
    : null;
  const api = upstream
    ? {
        handleWebsiteOpen: original.xk,
        createContextMenu: original.Mk,
        registerContextMenu: original.Lk,
      }
    : createSidePanelActions({ chrome, open, now: () => 123 });
  return { trace, state, api, listeners, chrome };
}
test("side-panel website messages preserve source validation, prompt limits and ignored invalid prompts", async () => {
  for (const message of [
    null,
    {},
    { type: "other" },
    ...[
      undefined,
      "",
      "  ",
      " hello ",
      42,
      "x".repeat(8192),
      "x".repeat(8193),
    ].map((prompt) => ({ type: "OPEN_CODEX_SIDE_PANEL", prompt })),
    { type: "OPEN_CODEX_SIDE_PANEL", mode: "work" },
    { type: "OPEN_CODEX_SIDE_PANEL", mode: "other" },
    { type: "OPEN_CODEX_SIDE_PANEL", source: null },
    { type: "OPEN_CODEX_SIDE_PANEL", source: "", prompt: "a" },
  ]) {
    const results = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream);
      const accepted = f.api.handleWebsiteOpen(message, sender, "prod");
      await flush();
      const rejected = f.api.handleWebsiteOpen(
        message,
        { ...sender, frameId: 1 },
        "prod",
      );
      await flush();
      results.push({ accepted, rejected, trace: f.trace });
    }
    assert.deepEqual(results[1], results[0]);
  }
});
test("side-panel prefill persists only after successful open, while failures remain swallowed", async () => {
  for (const failure of ["none", "open", "store"]) {
    const results = [];
    for (const upstream of [true, false]) {
      const f = fixture(upstream);
      let release!: () => void;
      f.state.gate = new Promise((resolve) => {
        release = resolve;
      });
      f.state.failOpen = failure === "open";
      f.state.failStore = failure === "store";
      assert.equal(
        f.api.handleWebsiteOpen(
          { type: "OPEN_CODEX_SIDE_PANEL", prompt: "hello" },
          sender,
          "prod",
        ),
        true,
      );
      await flush();
      assert.equal(f.trace.filter((row) => row[0] === "store").length, 0);
      release();
      await flush();
      results.push(f.trace);
    }
    assert.deepEqual(results[1], results[0]);
    assert.equal(
      results[1].filter((row) => row[0] === "store").length,
      failure === "open" ? 0 : 1,
    );
  }
});
test("side-panel context menu preserves URL fallbacks, empty selection opening and truncation", async () => {
  const results = [];
  for (const upstream of [true, false]) {
    const f = fixture(upstream);
    f.api.createContextMenu();
    f.api.registerContextMenu();
    for (const [info, tab] of [
      [{ menuItemId: "wrong" }, { id: 4, windowId: 2 }],
      [
        {
          menuItemId: "ask-chatgpt",
          pageUrl: "https://page/",
          selectionText: " ",
        },
        { id: 4, windowId: 2 },
      ],
      [
        {
          menuItemId: "ask-chatgpt",
          pageUrl: "https://page/",
          frameUrl: "https://frame/",
          selectionText: "selected",
        },
        { id: 4, windowId: 2, url: "https://tab/" },
      ],
      [
        { menuItemId: "ask-chatgpt", selectionText: "x".repeat(80001) },
        { id: 4, windowId: 2, pendingUrl: "https://pending/" },
      ],
      [{ menuItemId: "ask-chatgpt", pageUrl: "https://page/" }, undefined],
    ]) {
      f.listeners[0](info, tab);
      await flush();
    }
    results.push(f.trace);
  }
  assert.deepEqual(results[1], results[0]);
  const stores = results[1].filter((row) => row[0] === "store");
  assert.equal(stores.length, 2);
  assert.equal(
    stores[1][1]["codexWorkSidePanelInvocation:4"].selectedText.length,
    80000,
  );
});
