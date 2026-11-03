import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Tab } from "../packages/browser/dist/tab.js";
import { Browser } from "../packages/browser/dist/browser.js";
import * as commands from "../packages/browser/dist/commands/browser_session.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {jh,fm,gr,oa,vi};").toString("base64")}`
);
const local = { Tab, Browser },
  old = { Tab: original.jh, Browser: original.fm };
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
function fixture(impl: any, response?: (command: any) => any) {
  const calls: any[] = [];
  const transport = {
    display: async () => {},
    async send(args: any) {
      const command = args.command.toJSON();
      calls.push({ ...args, command });
      return response
        ? response(command)
        : {
            id: "t",
            title: "Title",
            url: "https://example.com",
            data: "AAH/",
            value: "result",
            items: ["history"],
          };
    },
  };
  const documentation = { get: async (name: string) => name };
  const makeTab = (extra = {}) =>
    new impl.Tab({
      browserId: "b",
      documentation,
      transport,
      tabPayload: { id: "t" },
      ...extra,
    });
  return { calls, transport, documentation, makeTab };
}
async function tabScenario(impl: any) {
  const f = fixture(impl),
    tab = f.makeTab(),
    results = [];
  for (const [method, args] of [
    ["goto", ["https://example.com"]],
    ["markHandoff", []],
    ["markDeliverable", []],
    ["requestManualHandoff", []],
    ["requestUserTakeover", ["captcha"]],
    ["back", []],
    ["forward", []],
    ["reload", []],
    ["close", []],
    ["screenshot", []],
    [
      "screenshot",
      [{ fullPage: true, clip: { x: 1, y: 2, width: 3, height: 4 } }],
    ],
    ["screenshot", [{ clip: { x: NaN, y: Infinity, width: -1, height: 0 } }]],
    ["title", []],
    ["url", []],
  ] as any[])
    results.push(await tab[method](...args));
  tab.id = "changed";
  await tab.goto("next");
  await tab.playwright.locator("button").click();
  await tab.cua.type({ text: "hello" });
  results.push(
    await outcome(() => tab.goto("")),
    await outcome(() =>
      tab.screenshot({ clip: { x: 1, y: 2, width: "3", height: 4 } }),
    ),
  );
  tab.id = "";
  results.push(await outcome(() => tab.goto("next")));
  return { results, calls: f.calls, keys: Object.keys(tab) };
}
test("Tab assembly routes navigation, handoff, screenshot bytes and immutable child targets like original", async () => {
  assert.deepEqual(await tabScenario(local), await tabScenario(old));
});
async function dialogScenario(impl: any) {
  const f = fixture(impl, () => ({ dialog }));
  let dialog: any;
  const tab = f.makeTab(),
    results = [];
  for (const type of [
    "alert",
    "beforeunload",
    "confirm",
    "prompt",
    "unknown",
    null,
  ]) {
    dialog = type === null ? null : { id: "dialog-id", type };
    const current = await tab.getJsDialog();
    if (!current) {
      results.push(undefined);
      continue;
    }
    results.push({ type: current.type, keys: Object.keys(current) });
    await current.dismiss();
    if (type === "confirm") await current.accept();
    if (type === "prompt") await current.accept("yes");
  }
  return { results, calls: f.calls };
}
test("Tab creates original dialog variants and returns undefined for absent or unknown types", async () => {
  assert.deepEqual(await dialogScenario(local), await dialogScenario(old));
});
async function unboundScenario(impl: any) {
  const f = fixture(impl),
    results = [];
  for (const tabPayload of [undefined, {}, { id: "" }, { id: 0 }])
    results.push(await outcome(() => f.makeTab({ tabPayload })));
  const tab = f.makeTab({ transport: undefined });
  for (const method of [
    "back",
    "forward",
    "reload",
    "close",
    "screenshot",
    "title",
    "url",
    "getJsDialog",
    "markHandoff",
    "markDeliverable",
  ])
    results.push(await outcome(() => tab[method]()));
  results.push(
    await outcome(() => tab.goto("")),
    await outcome(() => tab.goto("url")),
  );
  return results;
}
test("Tab constructor and transport guards preserve original validation precedence", async () => {
  assert.deepEqual(await unboundScenario(local), await unboundScenario(old));
});
async function browserScenario(impl: any) {
  const f = fixture(impl),
    events: any[] = [];
  const browser = new impl.Browser({
    browserId: "b",
    transport: f.transport,
    onBrowserUsed() {
      events.push(this === browser);
    },
    capabilities: {
      browser: [{ id: "visibility" }, { id: "missing" }],
      tab: [{ id: "browserAuth" }, { id: "cdp" }],
    },
  });
  const child = await browser.tabs.get("t");
  assert.ok(child instanceof impl.Tab);
  const results = [
    Object.keys(browser),
    Object.keys(child),
    await browser.capabilities.list(),
    await child.capabilities.list(),
    await browser.documentation(),
    await browser.history(),
    await browser.history({
      queries: ["", "abc"],
      limit: 2,
      from: 0,
      to: new Date("2024-01-01T00:00:00Z"),
    }),
    await browser.history({ queries: null, limit: null, from: null, to: null }),
  ];
  browser.browserId = "public-changed";
  await browser.documentation();
  await browser.nameSession("  readable name  ");
  await browser.history();
  results.push(await outcome(() => browser.nameSession(" ")));
  for (const options of [
    null,
    [],
    1,
    () => {},
    { queries: [] },
    { queries: [1] },
    { limit: 0 },
    { limit: 1.2 },
    { from: "bad" },
    { to: "bad" },
    { queries: [], limit: 0, from: "bad" },
  ])
    results.push(await outcome(() => browser.history(options)));
  return { results, events, calls: f.calls };
}
test("Browser assembles capabilities/Tab factories and retains history validation, dates and public/private ids", async () => {
  assert.deepEqual(await browserScenario(local), await browserScenario(old));
});
async function setterScenario(impl: any) {
  const f = fixture(impl),
    events: string[] = [];
  class CustomTab extends impl.Tab {}
  for (const name of [
    "id",
    "playwright",
    "dom_cua",
    "cua",
    "ax",
    "content",
    "clipboard",
    "dev",
    "capabilities",
  ])
    Object.defineProperty(CustomTab.prototype, name, {
      configurable: true,
      set(value) {
        events.push(name);
        Object.defineProperty(this, name, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
    });
  const tab = new CustomTab({
    browserId: "b",
    documentation: f.documentation,
    transport: f.transport,
    tabPayload: { id: "t" },
  });
  class CustomBrowser extends impl.Browser {}
  for (const name of ["browserId", "capabilities", "tabs", "user"])
    Object.defineProperty(CustomBrowser.prototype, name, {
      configurable: true,
      set(value) {
        events.push(name);
        Object.defineProperty(this, name, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      },
    });
  new CustomBrowser({ browserId: "b", transport: f.transport });
  const root = Object.getPrototypeOf(tab);
  return {
    events,
    methods: Object.getOwnPropertyNames(impl.Tab.prototype),
    browserMethods: Object.getOwnPropertyNames(impl.Browser.prototype),
  };
}
test("Tab/Browser constructors retain inherited setters and original public assignment/method order", async () => {
  assert.deepEqual(await setterScenario(local), await setterScenario(old));
});
test("Browser session command payloads, raw construction and result schemas match original", async () => {
  for (const [name, symbol] of [
    ["BrowserDocumentation", "gr"],
    ["NameSession", "oa"],
    ["BrowserHistory", "vi"],
  ]) {
    const ours = commands[name],
      theirs = original[symbol];
    for (const payload of [
      {
        browser_id: "b",
        name: "n",
        queries: [""],
        limit: 1,
        from: "anything",
        to: "x",
      },
      { browser_id: 3, queries: [], limit: 0 },
      {},
    ]) {
      assert.deepEqual(
        ours.create(payload).toJSON(),
        theirs.create(payload).toJSON(),
      );
      assert.deepEqual(
        await outcome(() => ours.create(payload).parse()),
        await outcome(() => theirs.create(payload).parse()),
      );
    }
    for (const result of [
      "",
      {},
      { items: [{ url: "u", dateVisited: "date", extra: true }], extra: 1 },
      { items: [{ url: 2 }] },
    ])
      assert.deepEqual(
        await outcome(() => ours.ResultSchema.parse(result)),
        await outcome(() => theirs.ResultSchema.parse(result)),
      );
  }
});
