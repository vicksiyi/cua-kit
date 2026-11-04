import assert from "node:assert/strict";
import test from "node:test";
import { sidePanelBinding } from "./side-panel-source";
import {
  normalizeSidePanelConversationUrl,
  createSidePanelFrame,
  startWindowSidePanelPage,
  startSidePanelPage,
} from "../packages/browser-extension/src/side_panel_page";
function event() {
  const listeners = new Set<Function>();
  return {
    listeners,
    addListener: (fn: Function) => listeners.add(fn),
    removeListener: (fn: Function) => listeners.delete(fn),
    emit: (...args: any[]) => {
      for (const fn of listeners) fn(...args);
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
function dom(trace: any[]) {
  let next = 0;
  const pagehide = event();
  const doc: any = {
    defaultView: {
      addEventListener: (_name: string, fn: Function) =>
        pagehide.addListener(fn),
      removeEventListener: (_name: string, fn: Function) =>
        pagehide.removeListener(fn),
    },
    createElement(tag: string) {
      const node: any = {
        tag,
        id: next++,
        hidden: false,
        attributes: {},
        setAttribute(key: string, value: string) {
          node.attributes[key] = value;
        },
        remove() {
          trace.push(["remove", node.id]);
        },
        append(child: any) {
          trace.push(["append", node.id, child.id]);
        },
        replaceChildren(child: any) {
          trace.push([
            "replace",
            node.id,
            child.tag,
            child.src,
            child.title,
            child.attributes,
          ]);
        },
      };
      return node;
    },
  };
  const container = doc.createElement("div");
  doc.querySelector = () => container;
  return { doc, container, pagehide };
}
test("sidepanel URL normalization and iframe policy match original", () => {
  const original = sidePanelBinding("ne", {
    Ye: new Set([
      "messageId",
      "onboarding_conversation",
      "owner_user_id",
      "surface",
      "tab",
      "temporary-chat",
    ]),
  });
  for (const value of [
    null,
    17,
    "bad",
    "https://chatgpt.com/c/abc",
    "https://chatgpt.com/c/abc?surface=browser_side_chat",
    "https://chatgpt.com/?surface=other",
    "https://chatgpt.com/?surface=browser_side_chat&surface=browser_side_chat",
    "https://chatgpt.com/?unknown=x",
    "https://chatgpt.com/#hash",
    "https://u:p@chatgpt.com/",
    "http://chatgpt.com/",
    "https://other.invalid/",
    "https://chatgpt.com/?tab=one&tab=two",
  ])
    for (const workModeUrl of [
      null,
      "https://chatgpt.com/?surface=browser_side_chat",
    ])
      assert.equal(
        normalizeSidePanelConversationUrl({ value, workModeUrl }),
        original({ value, workModeUrl }),
      );
  const traces = [createSidePanelFrame, sidePanelBinding("D")].map((fn) => {
    const trace: any[] = [];
    const { doc, container } = dom(trace);
    fn(container, doc, "https://chatgpt.com/?surface=browser_side_chat");
    return trace;
  });
  assert.deepEqual(traces[0], traces[1]);
});
test("window-scoped sidepanel matches tab switching, replacement, delayed disposal and query failure", async () => {
  for (const mode of ["normal", "late-panel", "query-failure", "stale-query"]) {
    async function scenario(restored: boolean) {
      const trace: any[] = [];
      const { doc, container, pagehide } = dom(trace);
      let active = 1,
        queries = 0;
      let releasePanel: Function | undefined,
        releaseQuery: Function | undefined;
      const events = Array.from({ length: 5 }, event);
      const browser: any = {
        tabs: {
          query: async (options: any) => {
            trace.push(["query", options]);
            queries++;
            if (mode === "query-failure" && queries === 1)
              throw Error("query failed");
            if (mode === "stale-query" && queries === 2)
              await new Promise((resolve) => (releaseQuery = resolve));
            return [{ id: active, windowId: 7 }];
          },
          onActivated: events[0],
          onRemoved: events[1],
          onDetached: events[2],
          onAttached: events[3],
          onReplaced: events[4],
        },
      };
      const createPanel = async ({ tab }: any) => {
        trace.push(["create", tab.id]);
        if (mode === "late-panel" && tab.id === 2)
          await new Promise((resolve) => (releasePanel = resolve));
        return {
          setActive: (value: boolean) => trace.push(["active", tab.id, value]),
          dispose: () => trace.push(["dispose", tab.id]),
        };
      };
      const options = {
        frameContainer: container,
        pageDocument: doc,
        windowId: 7,
        workModeUrl: "https://chatgpt.com/",
      };
      try {
        if (restored)
          await startWindowSidePanelPage(
            { chrome: browser, createPanel },
            options,
          );
        else
          await sidePanelBinding("it", { chrome: browser, ge: createPanel })(
            options,
          );
      } catch (e) {
        trace.push((e as Error).message);
      }
      active = 2;
      events[0].emit({ windowId: 8 });
      events[0].emit({ windowId: 7 });
      await flush();
      active = 3;
      events[3].emit(3, { newWindowId: 7 });
      await flush();
      releaseQuery?.();
      await flush();
      events[4].emit(4, 1);
      await flush();
      pagehide.emit();
      releasePanel?.();
      await flush();
      trace.push(
        events.map((e) => e.listeners.size),
        pagehide.listeners.size,
      );
      return trace;
    }
    assert.deepEqual(await scenario(true), await scenario(false), mode);
  }
});
test("sidepanel entry preserves missing-root, no-tab, disabled and rejected-query fallbacks", async () => {
  for (const mode of [
    "missing-root",
    "disabled",
    "no-api",
    "no-tab",
    "reject",
    "normal",
    "panel-error",
  ]) {
    async function scenario(restored: boolean) {
      const trace: any[] = [];
      const { doc, container } = dom(trace);
      if (mode === "missing-root") doc.querySelector = () => null;
      const chrome: any =
        mode === "no-api"
          ? undefined
          : {
              tabs: {
                query: async () => {
                  if (mode === "reject") throw Error("query");
                  return mode === "no-tab" ? [] : [{ id: 1, windowId: 7 }];
                },
              },
            };
      const panel = async (options: any) => {
        trace.push(["panel", options.tab.id]);
        if (mode === "panel-error") throw Error("panel");
      };
      const options = {
        document: doc,
        workModeUrl: mode === "disabled" ? null : "https://chatgpt.com/",
      };
      try {
        if (restored)
          await startSidePanelPage(
            { chrome, isEdge: () => false, createPanel: panel },
            options,
          );
        else
          await sidePanelBinding("rt", {
            globalThis: { chrome },
            Fe: () => false,
            D: sidePanelBinding("D"),
            ge: panel,
          })(options);
      } catch (e) {
        trace.push((e as Error).message);
      }
      return trace;
    }
    assert.deepEqual(await scenario(true), await scenario(false), mode);
  }
});
