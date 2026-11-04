import assert from "node:assert/strict";
import test from "node:test";
import { extensionBindings } from "./extension-source";
import {
  createTabMentionMessageRouter,
  isTabMentionSender,
  sendTabMentionsInvalidated,
} from "../packages/browser-extension/src/tab_mention_messages";
const sender: any = {
  id: "extension",
  frameId: 0,
  origin: "https://chatgpt.com",
  url: "https://chatgpt.com/work",
  tab: { id: 3, windowId: 1 },
};
const request = {
  type: "search_browser_tab_mentions",
  query: "page",
  limit: 2,
};
const names = [
  "Xt",
  "hm",
  "fm",
  "Nc",
  "_s",
  "cn",
  "If",
  "ds",
  "vc",
  "Lp",
  "_c",
  "xp",
  "Mp",
  "ZC",
  "Tf",
  "KC",
  "yp",
  "hR",
];
const drain = () => new Promise((resolve) => setImmediate(resolve));
function original(runtime = { id: "extension" }) {
  return extensionBindings(names, { chrome: { runtime } });
}
test("mention sender gates match original page, side-panel and build-channel boundaries", () => {
  const source = original();
  for (const channel of ["prod", "dev", "internal"]) {
    for (const patch of [
      {},
      { id: "other" },
      { frameId: 1 },
      { documentLifecycle: "cached" },
      { tab: undefined },
      { tab: undefined, frameId: undefined },
      { tab: {} },
      { origin: "https://spoof.test" },
      { url: "bad" },
      {
        url: "https://chatgpt-staging.com/",
        origin: "https://chatgpt-staging.com",
      },
      { url: "http://localhost:3000/", origin: "http://localhost:3000" },
      { url: "https://localhost:3000/", origin: "https://localhost:3000" },
      { url: "https://sub.chatgpt.com/", origin: "https://sub.chatgpt.com" },
    ]) {
      const value = { ...sender, ...patch };
      assert.equal(
        isTabMentionSender(value, channel, "extension"),
        source.If(value, channel),
      );
    }
  }
});
test("mention runtime search preserves authorization, strict payload, sender exclusion and errors", async () => {
  const results = [];
  for (const upstream of [true, false]) {
    const trace: any[] = [];
    const provider: any = {
      async getUserTabs(query: any) {
        trace.push(["search", query]);
        if (query.query === "fail") throw "failure";
        return [{ id: 3 }, { id: 4 }, { id: 5 }];
      },
    };
    const handle = upstream
      ? (m: any, s: any, r: any) => original().Tf(provider, "prod", m, s, r)
      : createTabMentionMessageRouter(provider, "prod", { id: "extension" })
          .handleMessage;
    for (const [message, source] of [
      [request, sender],
      [{ ...request, limit: 0 }, sender],
      [{ ...request, limit: 100 }, sender],
      [{ ...request, query: "fail" }, sender],
      [{ ...request, extra: true }, sender],
      [{ ...request, limit: -1 }, sender],
      [request, { ...sender, tab: { ...sender.tab, incognito: true } }],
      [request, { ...sender, tab: undefined }],
      [{ type: "unrelated" }, sender],
      [Object.create(request), sender],
    ]) {
      trace.push([
        "handled",
        handle(message, source, (reply: any) => trace.push(["reply", reply])),
      ]);
      await drain();
    }
    results.push(trace);
  }
  assert.deepEqual(results[1], results[0]);
});
test("mention ports preserve single search, streaming updates and disconnect races", async () => {
  for (const scenario of [
    "normal",
    "disconnect-pending",
    "post-fails",
    "bad-sender",
    "wrong-port",
    "unknown-message",
    "search-error",
  ]) {
    const results = [];
    for (const upstream of [true, false]) {
      const trace: any[] = [],
        messages = new Set<Function>(),
        disconnects = new Set<Function>();
      let resolve!: (value: any) => void,
        reject!: (error: any) => void,
        updated: Function | undefined;
      const provider: any = {
        getUserTabs(query: any) {
          trace.push(["search", query]);
          return new Promise((a, b) => {
            resolve = a;
            reject = b;
          });
        },
        subscribeCandidateUpdates(candidates: any, listener: Function) {
          trace.push(["subscribe", candidates]);
          updated = listener;
          return () => {
            trace.push(["unsubscribe"]);
            updated = undefined;
          };
        },
      };
      const port: any = {
        name: scenario === "wrong-port" ? "wrong" : request.type,
        sender: scenario === "bad-sender" ? { ...sender, id: "other" } : sender,
        onMessage: {
          addListener(fn: Function) {
            trace.push(["add-message"]);
            messages.add(fn);
          },
          removeListener(fn: Function) {
            trace.push(["remove-message"]);
            messages.delete(fn);
          },
        },
        onDisconnect: {
          addListener(fn: Function) {
            trace.push(["add-disconnect"]);
            disconnects.add(fn);
          },
        },
        disconnect() {
          trace.push(["disconnect"]);
        },
        postMessage(value: any) {
          trace.push(["post", value]);
          if (scenario === "post-fails") throw Error("closed");
        },
      };
      if (upstream) original().KC(provider, "prod", port);
      else
        createTabMentionMessageRouter(provider, "prod", {
          id: "extension",
        }).handleConnect(port);
      for (const listener of [...messages])
        listener(
          scenario === "unknown-message" ? { type: "unrelated" } : request,
        );
      for (const listener of [...messages]) listener(request);
      if (scenario === "disconnect-pending")
        for (const listener of disconnects) listener();
      if (resolve) {
        if (scenario === "search-error") reject(Error("search failed"));
        else resolve([{ id: 3 }, { id: 4 }]);
      }
      await drain();
      updated?.([{ id: 4, faviconUrl: "fixture" }]);
      for (const listener of disconnects) listener();
      updated?.([{ id: 5 }]);
      results.push(trace);
    }
    assert.deepEqual(results[1], results[0], scenario);
  }
});
test("mention invalidation notifies peer then runtime and swallows async runtime failure", async () => {
  for (const upstream of [true, false]) {
    const trace: any[] = [];
    const peer = {
      sendBrowserTabMentionsInvalidated() {
        trace.push("peer");
      },
    };
    const runtime: any = {
      sendMessage(message: any) {
        trace.push(message);
        return Promise.reject(Error("no listeners"));
      },
    };
    if (upstream) original().hR(peer, runtime);
    else sendTabMentionsInvalidated(peer, runtime);
    await drain();
    assert.deepEqual(trace, [
      "peer",
      { type: "browser_tab_mentions_invalidated" },
    ]);
  }
});
