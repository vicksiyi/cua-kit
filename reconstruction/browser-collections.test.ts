import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Agent,
  Browsers,
  Documentation,
} from "../packages/browser/dist/agent.js";
import { Tabs } from "../packages/browser/dist/tabs.js";
import * as inventory from "../packages/browser/dist/commands/browser_inventory.js";
import * as tabs from "../packages/browser/dist/commands/tabs.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {nl as Agent,il as Browsers,sl as Documentation,ol as Tabs,y,ir,dr,pr,Sr,Rr,Or,ha,ya,xa};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}

test("tabs collection preserves factory calls, raw responses, validation before empty content and async errors", async () => {
  async function run(
    Class: any,
    method: string,
    args: any[],
    response: any,
    fail = false,
  ) {
    const log: any[] = [];
    const transport = {
      display: async () => {},
      send: async ({ command }: any) => {
        log.push(["send", command.toJSON()]);
        if (fail) throw new Error("service failed");
        return response;
      },
    };
    const api = new Class({
      browserId: "b",
      transport,
      createTab: function (payload: any) {
        log.push(["create", payload, this === api]);
        return { bound: payload };
      },
    });
    const result = await outcome(() => api[method](...args));
    return { result, log };
  }
  const calls: [string, any[]][] = [
    ["new", []],
    ["selected", []],
    ["list", []],
    ["get", ["t"]],
    ["get", [""]],
    ["get", [0]],
    ["get", [4]],
    ["content", [{ urls: [], contentType: "text" }]],
    ["content", [{ urls: [], contentType: "invalid" }]],
    ["content", [{ urls: [], contentType: "text", timeoutMs: 0 }]],
    ["content", [{ urls: ["not-a-url"], contentType: "html", timeoutMs: 1 }]],
    [
      "content",
      [{ urls: ["a"], contentType: "domSnapshot", timeoutMs: undefined }],
    ],
    ["content", [{ urls: ["a", 3], contentType: "text" }]],
    ["content", [{}]],
  ];
  for (const [method, args] of calls)
    for (const response of [
      { id: "t", tabs: [1], results: ["content"] },
      { id: "" },
      { id: 0 },
      {},
      null,
    ])
      for (const fail of [false, true]) {
        assert.deepEqual(
          await run(Tabs, method, args, response, fail),
          await run(original.Tabs, method, args, response, fail),
          `${method}/${JSON.stringify(args)}`,
        );
      }
});

test("browser collection and Agent preserve use notifications, callback timing, documentation and factory transport", async () => {
  async function run(
    AgentClass: any,
    method: string,
    args: any[],
    failStage?: string,
  ) {
    const log: any[] = [];
    const info = { id: "b", capabilities: {} };
    const transport = {
      display: async () => {},
      send: async ({ command }: any) => {
        log.push(["send", command.toJSON()]);
        if (failStage === "send") throw new Error("send failed");
        return info;
      },
    };
    const api = new AgentClass({
      transport,
      onBrowserUsed: function (value: any) {
        log.push(["used", value, this === api.browsers]);
        if (failStage === "notify") throw new Error("notify failed");
      },
      createBrowser: function (options: any) {
        log.push([
          "create",
          options.browserInfo,
          options.transport === transport,
          this === api.browsers,
        ]);
        options.onBrowserUsed();
        if (failStage === "factory") throw new Error("factory failed");
        return { browser: options.browserInfo };
      },
    });
    const result = await outcome(() =>
      method === "documentation"
        ? api.documentation.get(...args)
        : api.browsers[method](...args),
    );
    return { result, log };
  }
  for (const [method, args] of [
    ["list", []],
    ["get", ["b"]],
    ["get", [""]],
    ["get", [4]],
    ["getDefault", []],
    ["getForUrl", ["invalid-url"]],
    ["documentation", ["Tab"]],
  ] as any) {
    for (const fail of [undefined, "send", "notify", "factory"])
      assert.deepEqual(
        await run(Agent, method, args, fail),
        await run(original.Agent, method, args, fail),
      );
  }
  assert.deepEqual(
    await outcome(() => new (Agent as any)({})),
    await outcome(() => new original.Agent({})),
  );
  // Factory works without notification callback and receives a callable no-op callback.
  for (const Class of [Browsers, original.Browsers]) {
    const b = new Class({
      transport: { send: async () => ({ id: "b" }) },
      createBrowser: ({ onBrowserUsed }: any) => onBrowserUsed(),
    });
    assert.equal(await b.getDefault(), undefined);
  }
});

test("inventory and tabs command schemas preserve original parsing, result projection and command defaults", async () => {
  const pairs = [
    [inventory.ListBrowsersCommand, original.y],
    [inventory.GetBrowserCommand, original.ir],
    [inventory.GetDefaultBrowserCommand, original.dr],
    [inventory.GetDocumentationCommand, original.pr],
    [inventory.GetBrowserForUrlCommand, original.Sr],
    [tabs.CreateTabCommand, original.Rr],
    [tabs.GetTabCommand, original.Or],
    [tabs.SelectedTabCommand, original.ha],
    [tabs.ListTabsCommand, original.ya],
    [tabs.TabsContentCommand, original.xa],
  ];
  const inputs = [
    undefined,
    null,
    {},
    [],
    "text",
    {
      id: "b",
      browser_id: "b",
      tab_id: "t",
      name: "Tab",
      url: "https://example.com",
      urls: ["a"],
      content_type: "text",
      extra: 1,
    },
    {
      id: 4,
      browser_id: "b",
      tab_id: "t",
      url: "bad",
      urls: [],
      content_type: "text",
      timeout_ms: 0,
    },
    {
      id: "b",
      name: "Browser",
      family: "  chrome  ",
      type: "cdp",
      capabilities: { browser: [{ id: "x", description: "desc", extra: 1 }] },
      extra: 1,
    },
    { id: "b", name: "Browser", type: "cdp", capabilities: {} },
    { tabs: [{ id: "t", providerTabId: "7", extra: 1 }] },
    { results: [{ url: "url", title: null, content: "text", extra: 1 }] },
  ];
  for (const [restored, vendor] of pairs)
    for (const value of inputs) {
      assert.deepEqual(
        await outcome(() => restored.create(value).toJSON()),
        await outcome(() => vendor.create(value).toJSON()),
      );
      assert.deepEqual(
        await outcome(() => restored.create(value).parse()),
        await outcome(() => vendor.create(value).parse()),
      );
      assert.deepEqual(
        await outcome(() => restored.ResultSchema.parse(value)),
        await outcome(() => vendor.ResultSchema.parse(value)),
      );
    }
});
