import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createSidePanelAuthHandler,
  isSidePanelAuthOpen,
  isSidePanelAuthState,
  isSidePanelAuthOperation,
} from "../packages/browser-extension/src/side_panel_auth";
const names = ["_r", "Jk", "Go", "Xk", "Wt", "Jf", "Xf", "eR", "Yk", "Qk"];
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("side panel auth validators retain original inherited-field and numeric behavior", () => {
  const original = extensionBindings(names, { chrome: {} });
  const open = {
    type: "CODEX_WORK_SIDE_PANEL_AUTH_OPEN",
    action: "login",
    ownerTabId: 1,
    ownerWindowId: 2,
  };
  const state = {
    ...open,
    type: "CODEX_WORK_SIDE_PANEL_AUTH_STATE",
    state: "signed_in",
  };
  const operation = { ...open, authTabId: 3, expiresAt: -1 };
  const inputs: any[] = [
    null,
    undefined,
    1,
    [],
    {},
    open,
    state,
    operation,
    Object.create(open),
    Object.create(state),
    Object.create(operation),
  ];
  for (const value of [
    -1,
    0,
    NaN,
    Infinity,
    0.5,
    "1",
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    for (const key of ["ownerTabId", "ownerWindowId", "authTabId", "expiresAt"])
      inputs.push({ ...operation, [key]: value });
  }
  for (const input of inputs) {
    assert.equal(isSidePanelAuthOpen(input), original.Jf(input));
    assert.equal(isSidePanelAuthState(input), original.Xf(input));
    assert.equal(isSidePanelAuthOperation(input), original.eR(input));
  }
});
test("side panel auth matches queued reuse, focus, completion, expiry and failure handling", async () => {
  for (const mode of [
    "normal",
    "logout",
    "open",
    "disabled",
    "wrong-sender",
    "owner-moved",
    "auth-moved",
    "expired",
    "bad-storage",
    "read-fails",
    "write-fails",
    "create-fails",
    "missing-id",
    "focus-fails",
    "remove-fails",
    "send-fails",
    "callback-throws",
  ]) {
    const outputs = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        updates: Function[] = [],
        removals: Function[] = [];
      let now = 1000,
        nextId = 10,
        failed = false;
      let storage: any =
        mode === "bad-storage" ? [] : { bad: { action: "wrong" } };
      const tabs = new Map<number, any>([
        [1, { id: 1, windowId: mode === "owner-moved" ? 9 : 2 }],
      ]);
      function log(kind: string, value?: unknown) {
        trace.push([kind, structuredClone(value)]);
        if (!failed && mode === `${kind}-fails`) {
          failed = true;
          throw Error(mode);
        }
      }
      const chrome: any = {
        runtime: {
          id: "fixture",
          getURL: (path: string) => `chrome-extension://fixture/${path}`,
          async sendMessage(value: unknown) {
            log("send", value);
          },
        },
        storage: {
          session: {
            async get(key: string) {
              log("read", key);
              return { [key]: structuredClone(storage) };
            },
            async set(value: any) {
              log("write", value);
              storage = structuredClone(value.codexWorkSidePanelAuthOperations);
            },
          },
        },
        tabs: {
          onUpdated: {
            addListener(fn: Function) {
              trace.push("updated-listener");
              updates.push(fn);
            },
          },
          onRemoved: {
            addListener(fn: Function) {
              trace.push("removed-listener");
              removals.push(fn);
            },
          },
          async get(id: number) {
            log("get-tab", id);
            if (!tabs.has(id)) throw Error("missing tab");
            return { ...tabs.get(id) };
          },
          async update(id: number, options: unknown) {
            log("update-tab", { id, options });
            return { ...tabs.get(id) };
          },
          async create(options: any) {
            log("create", options);
            const tab = {
              ...options,
              id: mode === "missing-id" ? undefined : nextId++,
            };
            if (tab.id != null) tabs.set(tab.id, tab);
            return tab;
          },
          async remove(id: number) {
            log("remove", id);
            tabs.delete(id);
          },
        },
        windows: {
          async update(id: number, options: unknown) {
            log("focus", { id, options });
          },
        },
      };
      const onState = () => {
        trace.push("auth-state");
        if (mode === "callback-throws") throw Error("callback");
      };
      const url =
        mode === "disabled"
          ? null
          : "https://chatgpt.com/?surface=browser_side_chat";
      const original = upstream
        ? extensionBindings(names, { chrome, Date: { now: () => now } })
        : undefined;
      const handler = upstream
        ? original.Yk(url, onState)
        : createSidePanelAuthHandler({ chrome, now: () => now }, url, onState);
      const sender = {
        id: "fixture",
        url:
          chrome.runtime.getURL("codex-work-sidepanel.html") +
          (mode === "wrong-sender" ? "?wrong" : ""),
      };
      const message = (value: any) => {
        try {
          trace.push([
            "return",
            handler(value, sender, (reply: any) =>
              trace.push(["reply", reply]),
            ),
          ]);
        } catch (error) {
          trace.push(["throw", (error as Error).message]);
        }
      };
      const action =
        mode === "logout" ? "logout" : mode === "open" ? "open" : "login";
      const open = {
        type: "CODEX_WORK_SIDE_PANEL_AUTH_OPEN",
        action,
        ownerTabId: 1,
        ownerWindowId: 2,
      };
      message({});
      message(open);
      message(open);
      await flush();
      if (mode === "auth-moved" && tabs.has(10)) tabs.get(10).windowId = 7;
      if (mode === "expired") now += 600000;
      message({ ...open, action: "open" });
      await flush();
      const latest = storage?.["1"]?.authTabId ?? 10;
      for (const update of updates) {
        update(latest, { status: "loading" }, { url: "https://chatgpt.com/" });
        for (const url of [
          "bad-url",
          "https://other.test/",
          "https://chatgpt.com/auth/login",
          "https://chatgpt.com/auth/login/",
          "https://chatgpt.com/",
        ])
          update(latest, { status: "complete" }, { url });
      }
      await flush();
      message({
        type: "CODEX_WORK_SIDE_PANEL_AUTH_STATE",
        state: action === "logout" ? "signed_in" : "signed_out",
        ownerTabId: 1,
        ownerWindowId: 2,
      });
      message({
        type: "CODEX_WORK_SIDE_PANEL_AUTH_STATE",
        state: action === "logout" ? "signed_out" : "signed_in",
        ownerTabId: 1,
        ownerWindowId: 2,
      });
      await flush();
      message(open);
      await flush();
      const authId = storage?.["1"]?.authTabId ?? 10;
      for (const remove of removals) remove(authId);
      await flush();
      message(open);
      await flush();
      now += 600000;
      for (const update of updates)
        update(
          storage?.["1"]?.authTabId ?? 10,
          { status: "complete" },
          { url: "https://chatgpt.com/" },
        );
      await flush();
      message(open);
      await flush();
      for (const remove of removals) remove(1);
      await flush();
      outputs.push({ trace, storage });
    }
    assert.deepEqual(outputs[1], outputs[0], mode);
  }
});
