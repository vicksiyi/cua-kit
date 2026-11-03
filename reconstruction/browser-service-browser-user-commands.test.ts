import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  BrowserUserClaimTabCommand as claim,
  BrowserUserGetTabContextCommand as contextCommand,
  BrowserUserHistoryCommand as history,
  BrowserUserOpenTabsCommand as tabs,
  browsingHistoryQuery,
} from "../packages/browser/src/service/commands/browser_user";
const original = originalServiceBindings([
  "F",
  "W",
  "Gp",
  "Vp",
  "W9",
  "rR",
  "nR",
]);
async function run(kind: string, source: boolean, mode: string) {
  const trace: any[] = [];
  let authorityQuery: any;
  const tab = {
    id: 42,
    providerTabId: mode === "null" ? null : 0,
    title: mode === "null" ? null : "",
    url: mode === "null" ? null : "https://fixture.test/",
    lastOpened: mode === "null" ? null : 0,
    tabGroup: mode === "null" ? null : false,
    privateField: "excluded",
  };
  const ctx: any = {
    browserUser: {
      async claimTab(id: number) {
        trace.push(["claim", id]);
        if (mode === "provider-error") throw Error("provider failed");
        return tab;
      },
      async getTabContext(id: number, url: string) {
        trace.push(["context", id, url]);
        if (mode === "provider-error") throw Error("provider failed");
        return { content: "fixture", id };
      },
      async openTabs() {
        trace.push("tabs");
        if (mode === "provider-error") throw Error("provider failed");
        return [tab];
      },
    },
    tabLifecycle: {
      recordAcquired(id: number) {
        trace.push(["acquired", id]);
        if (mode === "lifecycle-error") throw Error("record failed");
      },
    },
    security: {
      async currentUserTabUrl(id: number) {
        trace.push(["url", id]);
        if (mode === "url-error") throw Error("url failed");
        return "https://fixture.test/";
      },
    },
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent(url: string, options: any) {
          trace.push(["observe", url, options]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
        readBrowsingHistory(query: any) {
          authorityQuery = query;
          trace.push(["history-authority", query]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    async history(query: any) {
      trace.push(["history", query, query === authorityQuery]);
      if (mode === "provider-error") throw Error("provider failed");
      return [
        {
          url: "https://fixture.test/",
          title: mode === "null" ? null : "",
          dateVisited: "2026-01-01",
          secret: "excluded",
        },
      ];
    },
  };
  const command = (
    {
      claim: source ? original.Gp : claim,
      context: source ? original.Vp : contextCommand,
      history: source ? original.rR : history,
      tabs: source ? original.nR : tabs,
    } as any
  )[kind];
  try {
    return {
      value: await command(
        {
          tab_id: mode === "invalid-tab" ? 0 : "7",
          queries: mode === "invalid-query" ? [] : [""],
          limit: 2,
          from: "2026-02-01",
          to: "2026-01-01",
        },
        ctx,
      ),
      trace,
    };
  } catch (e) {
    return { error: (e as Error).message, trace };
  }
}
test("browser user commands match original claim, observation, history and metadata handling", async () => {
  for (const kind of ["claim", "context", "history", "tabs"])
    for (const mode of [
      "normal",
      "null",
      "invalid-tab",
      "invalid-query",
      "provider-error",
      "lifecycle-error",
      "url-error",
      "denied",
    ])
      assert.deepEqual(
        await run(kind, false, mode),
        await run(kind, true, mode),
        `${kind}/${mode}`,
      );
  const acquired = await run("claim", false, "normal");
  assert.deepEqual(acquired.trace, [
    ["claim", 7],
    ["acquired", 42],
  ]);
  assert.deepEqual(acquired.value, {
    id: "42",
    title: "",
    url: "https://fixture.test/",
  });
  assert.deepEqual((await run("context", false, "normal")).trace, [
    ["url", 7],
    "authority",
    ["observe", "https://fixture.test/", { bypassApproval: true }],
    "assert",
    ["context", 7, "https://fixture.test/"],
  ]);
  assert.equal((await run("history", false, "normal")).trace.at(-1)[2], true);
  assert.deepEqual((await run("tabs", false, "null")).value, {
    tabs: [{ id: "42" }],
  });
});
test("history validation preserves field order, copying and original permissive date range semantics", () => {
  const outcome = (fn: () => unknown) => {
    try {
      return { value: fn() };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  const payloads: any[] = [
    {},
    { queries: null, limit: null, from: null, to: null },
    { queries: [] },
    { queries: "x" },
    { queries: [1] },
    { queries: ["", " "] },
    { queries: ["x", null] },
    { queries: ["x"], limit: 0 },
    { limit: "1" },
    { limit: 1.5 },
    { limit: Infinity },
    { limit: 1 },
    { limit: Number.MAX_SAFE_INTEGER + 1 },
    { from: "" },
    { from: 2 },
    { from: "bad" },
    { to: "bad" },
    { from: "2026-02-01", to: "2026-01-01" },
    { queries: [], limit: -1, from: "bad" },
    { limit: 0, from: "bad" },
    { from: "bad", to: "bad" },
  ];
  for (const payload of payloads)
    assert.deepEqual(
      outcome(() => browsingHistoryQuery(payload)),
      outcome(() => original.W9(payload)),
    );
  const queries = [""];
  const result = browsingHistoryQuery({ queries });
  assert.deepEqual(result.queries, queries);
  assert.notEqual(result.queries, queries);
  assert.deepEqual(
    browsingHistoryQuery({ from: "2026-02-01", to: "2026-01-01" }),
    { from: "2026-02-01", to: "2026-01-01" },
  );
});

test("user commands assemble with actual BrowserUser context and session-scoped lifecycle", async () => {
  const { ServiceBrowserUser } =
    await import("../packages/browser/src/service/context/browser_user");
  const { TabLifecycle } =
    await import("../packages/browser/src/service/context/tab_lifecycle");
  let sessionId = "session-one",
    turnId = "turn-one",
    changed = false;
  const trace: any[] = [];
  const lifecycle = new TabLifecycle({
    getCurrentSessionId: () => sessionId,
    getCurrentTurnId: () => turnId,
  });
  const user = new ServiceBrowserUser({
    async getUserTabs() {
      return [{ id: 42, title: "Fixture", url: "https://fixture.test/" }];
    },
    async claimUserTab(id: number) {
      trace.push(["claim", id]);
      return { id: 42, title: "Fixture", url: "https://fixture.test/" };
    },
    async executeTabRead(request) {
      trace.push(["read", request]);
      return {
        url: changed ? "https://changed.test/" : request.expectedUrl,
        title: "Fixture",
        text: "Fixture page content",
        truncated: false,
      };
    },
  });
  const ctx: any = {
    browserUser: user,
    tabLifecycle: lifecycle,
    security: { currentUserTabUrl: async () => "https://fixture.test/" },
    acquireAuthority: () => ({
      observeContent: (url: string, options: any) => ({
        assert: async () => {
          trace.push(["authorized", url, options]);
        },
      }),
    }),
  };
  assert.deepEqual(await claim({ tab_id: 7 }, ctx), {
    id: "42",
    title: "Fixture",
    url: "https://fixture.test/",
  });
  assert.deepEqual(lifecycle.takeEvents(), [
    { type: "tab_acquired", tabId: 42, origin: "external" },
  ]);
  turnId = "turn-two";
  assert.equal(lifecycle.needsReclaim(42), true);
  await claim({ tab_id: 7 }, ctx);
  assert.equal(lifecycle.needsReclaim(42), false);
  assert.deepEqual(lifecycle.takeEvents(), []);
  const result: any = await contextCommand({ tab_id: 42 }, ctx);
  assert.equal(result.text, "Fixture page content");
  assert.deepEqual(trace.at(-2), [
    "authorized",
    "https://fixture.test/",
    { bypassApproval: true },
  ]);
  changed = true;
  await assert.rejects(contextCommand({ tab_id: 42 }, ctx), /authorized page/);
  sessionId = "session-two";
  assert.equal(lifecycle.currentSession().acquiredTabs.size, 0);
  await claim({ tab_id: 7 }, ctx);
  assert.equal(lifecycle.takeEvents().length, 1);
});
