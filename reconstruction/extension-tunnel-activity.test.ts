import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createTunnelActivity,
  isTunnelActivityTab,
  isTunnelListeningState,
} from "../packages/browser-extension/src/tunnel_activity";
function event() {
  const callbacks = new Set<Function>();
  return {
    addListener(fn: Function) {
      callbacks.add(fn);
    },
    removeListener(fn: Function) {
      callbacks.delete(fn);
    },
    emit(...args: unknown[]) {
      for (const fn of callbacks) fn(...args);
    },
    callbacks,
  };
}
const hosts = [
  "chatgpt.com",
  "chat.com",
  "openai.com",
  "openai.org",
  "chatgpt-staging.com",
  "openai-staging.com",
  "chatgpt.com",
];
test("activity URL heuristic and persisted-state guard match source", () => {
  const { xl, y_ } = extensionBindings(["xl", "y_"], { b_: hosts });
  for (const url of [
    undefined,
    "bad",
    "https://chatgpt.com/",
    "https://sub.openai.com",
    "http://chat.com/",
    "https://chatgpt.com.evil.invalid/",
    "https://openai.org/",
  ]) {
    assert.equal(isTunnelActivityTab({ url }), xl({ url }));
    assert.equal(
      isTunnelActivityTab({ pendingUrl: url }),
      xl({ pendingUrl: url }),
    );
  }
  const base = {
    listening: true,
    uncertain: false,
    activeTurns: [],
    lastTurnEndedAt: null,
  };
  for (const value of [
    null,
    undefined,
    {},
    base,
    { ...base, listening: false, uncertain: true },
    { ...base, listening: false, activeTurns: ["t"] },
    { ...base, activeTurns: [""] },
    { ...base, lastTurnEndedAt: NaN },
    { ...base, lastTurnEndedAt: -1 },
    { ...base, lastTurnEndedAt: 0 },
    Object.create(base),
  ])
    assert.equal(isTunnelListeningState(value), y_(value));
});
test("persisted activity, idle delay, uncertainty and event cleanup match original", async () => {
  for (const mode of [
    "fresh",
    "saved",
    "bad-state",
    "read-error",
    "write-error",
    "query-error",
    "bad-panels",
    "panel-context",
    "panel-storage",
    "active-tab",
  ]) {
    async function scenario(original: boolean) {
      const trace: unknown[] = [];
      let now = 1000;
      let failures = 0;
      let tabs: any[] =
        mode === "active-tab" ? [{ url: "https://chatgpt.com/" }] : [];
      let contexts: any[] = mode === "panel-context" ? [{}] : [];
      let panelState: any =
        mode === "bad-panels" ? "bad" : mode === "panel-storage" ? [1] : [];
      let persisted: any =
        mode === "bad-state"
          ? { listening: false, uncertain: true }
          : mode === "saved"
            ? {
                listening: true,
                uncertain: false,
                activeTurns: [],
                lastTurnEndedAt: 0,
              }
            : undefined;
      const created = event(),
        updated = event(),
        removed = event(),
        storageChanged = event(),
        opened = event();
      const browser: any = {
        tabs: {
          async query() {
            if (mode === "query-error") throw Error("query failed");
            return tabs;
          },
          onCreated: created,
          onUpdated: updated,
          onRemoved: removed,
        },
        runtime: {
          async getContexts() {
            return contexts;
          },
        },
        storage: {
          onChanged: storageChanged,
          session: {
            async get(key: string) {
              if (key === "browserUseTunnelListening" && mode === "read-error")
                throw Error("read failed");
              return {
                [key]:
                  key === "browserUseTunnelListening" ? persisted : panelState,
              };
            },
            async set(value: any) {
              trace.push(["set", structuredClone(value)]);
              if (mode === "write-error" && failures++ === 0)
                throw Error("write failed");
              persisted = value.browserUseTunnelListening;
            },
          },
        },
        sidePanel: { onOpened: opened },
      };
      const report = () => trace.push(["idle"]);
      const listener = (value: boolean) => trace.push(["listen", value]);
      const { w_ } = extensionBindings(["w_", "xl", "y_"], {
        chrome: browser,
        Date: { now: () => now },
        b_: hosts,
        v_: 600000,
        Hs: "browserUseTunnelListening",
        jn: "codexSidePanelOpenWindowIds",
        Ur: report,
      });
      const activity = await (original
        ? w_(listener)
        : createTunnelActivity(
            { chrome: browser, now: () => now, reportIdle: report },
            listener,
          ));
      activity.turnStarted("turn");
      activity.turnStarted("turn");
      await activity.refresh();
      tabs = [];
      contexts = [];
      panelState = [];
      activity.turnEnded("turn");
      now = 600999;
      await activity.refresh(); // one ms before the idle cutoff
      now = 601000;
      await activity.refresh();
      opened.emit({ windowId: 1 });
      await activity.refresh();
      created.emit({ url: "https://chatgpt.com/" });
      await activity.refresh();
      updated.emit(1, {}, { pendingUrl: "https://chat.com/" });
      await activity.refresh();
      removed.emit(1, {});
      storageChanged.emit({ codexSidePanelOpenWindowIds: {} }, "session");
      await activity.refresh();
      activity.stop();
      const before = trace.length;
      activity.turnStarted("after-stop");
      opened.emit({});
      await activity.refresh();
      for (let i = 0; i < 10; i++) await Promise.resolve();
      assert.equal(trace.length, before);
      for (const hook of [created, updated, removed, storageChanged, opened])
        assert.equal(hook.callbacks.size, 0);
      return trace;
    }
    assert.deepEqual(await scenario(false), await scenario(true), mode);
  }
});
