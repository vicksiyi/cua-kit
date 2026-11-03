import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PlaywrightAPI } from "../packages/browser/dist/playwright/api.js";
import { PlaywrightLocator } from "../packages/browser/dist/playwright/locator.js";
import { PlaywrightDownload } from "../packages/browser/dist/playwright/download.js";
import { PlaywrightFileChooser } from "../packages/browser/dist/playwright/file_chooser.js";
import * as commands from "../packages/browser/dist/commands/playwright_page.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {Nl,kl,$l,Zl,ad,dd,bd,wd,Td,Md,qd,Ud,Jd,Qd};").toString("base64")}`
);
const local = {
  API: PlaywrightAPI,
  Locator: PlaywrightLocator,
  Download: PlaywrightDownload,
  FileChooser: PlaywrightFileChooser,
};
const old = {
  API: original.Nl,
  Locator: original.kl,
  Download: original.$l,
  FileChooser: original.Zl,
};
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
function fixture(impl: any, send?: (command: any) => any) {
  const calls: any[] = [];
  const transport = {
    display: async () => {},
    async send(args: any) {
      const command = args.command.toJSON();
      calls.push({ ...args, command });
      if (send) return send(command);
      return {
        value: 3,
        dom_snapshot: "tree",
        data: "AAH/",
        path: "/tmp/download",
        download_id: "download",
        file_chooser_id: "chooser",
        is_multiple: true,
      };
    },
  };
  const api = new impl.API({ browserId: "b", tabId: "t", transport });
  return { api, transport, calls };
}
async function scenario(impl: any) {
  const f = fixture(impl),
    values = [];
  for (const [method, args] of [
    ["goBack", []],
    ["goForward", []],
    ["evaluate", ["arg", { x: 1 }, { timeoutMs: 5 }]],
    ["evaluate", [(arg) => arg, 4]],
    [
      "waitForURL",
      ["https://example.com", { waitUntil: "commit", timeoutMs: 7 }],
    ],
    ["waitForLoadState", []],
    ["waitForLoadState", [{ state: "networkidle", timeoutMs: 4 }]],
    ["waitForTimeout", [0]],
    ["waitForTimeout", [25]],
    ["elementInfo", [{ x: 1, y: 2, includeNonInteractable: false }]],
    ["elementScreenshot", [{ x: 1, y: 2 }]],
    ["domSnapshot", []],
  ] as any[])
    values.push(await f.api[method](...args));
  const locators = [
    f.api.locator("button"),
    f.api.getByRole("button", { name: "Submit" }),
    f.api.getByText("hi"),
    f.api.getByLabel("x"),
    f.api.getByPlaceholder("x"),
    f.api.getByTestId("x"),
    f.api.frameLocator("iframe").locator("button"),
  ].map((locator) => impl.Locator.browserAuthSelector(locator));
  for (const timeoutMs of [undefined, null, 10, 0]) {
    const download = await f.api.waitForEvent("download", { timeoutMs });
    assert.ok(download instanceof impl.Download);
    values.push(await download.path({ timeoutMs: 2 }));
  }
  const chooser = await f.api.waitForEvent("filechooser", { timeoutMs: 11 });
  assert.ok(chooser instanceof impl.FileChooser);
  values.push(chooser.isMultiple());
  await chooser.setFiles("one.txt", { timeoutMs: 30 });
  await chooser.setFiles(["a", "b"]);
  for (const [method, args] of [
    ["locator", [""]],
    ["frameLocator", [""]],
    ["waitForURL", [""]],
    ["waitForTimeout", [-1]],
    ["waitForTimeout", [1.5]],
    ["waitForTimeout", [NaN]],
    ["elementInfo", [{ x: Infinity, y: 2 }]],
    ["elementScreenshot", [{ x: 1, y: "2" }]],
    ["waitForEvent", ["popup"]],
  ] as any[])
    values.push(await outcome(() => f.api[method](...args)));
  return { values, locators, calls: f.calls };
}
test("PlaywrightAPI routes page operations, typed event objects, selectors, screenshots and original timeouts", async () => {
  assert.deepEqual(await scenario(local), await scenario(old));
});
async function navigationScenario(
  impl: any,
  rejectWait = false,
  rejectAction = false,
) {
  const events: any[] = [];
  let settle: any;
  const f = fixture(impl, (command) => {
    events.push(command.type);
    return new Promise((resolve, reject) => {
      settle = rejectWait
        ? () => reject(new Error("wait failed"))
        : () => resolve({});
    });
  });
  const result = f.api.expectNavigation(
    () => {
      events.push("action");
      if (rejectAction) throw new Error("action failed");
      return "done";
    },
    { url: "https://example.com", timeoutMs: 6, waitUntil: "commit" },
  );
  events.push("returned");
  const observed = outcome(() => result);
  await Promise.resolve();
  events.push("before settle");
  settle();
  const output = await observed;
  const f2 = fixture(impl);
  const second = await f2.api.expectNavigation(() => 42, { waitUntil: "load" });
  return { events, output, calls: f.calls, second, secondCalls: f2.calls };
}
test("expectNavigation starts wait before scheduling action and preserves Promise.all results/failures", async () => {
  for (const [wait, action] of [
    [false, false],
    [true, false],
    [false, true],
  ])
    assert.deepEqual(
      await navigationScenario(local, wait, action),
      await navigationScenario(old, wait, action),
    );
});
test("waitForEvent returns an already-handled rejecting promise without swallowing caller rejection", async () => {
  for (const impl of [local, old]) {
    const f = fixture(impl, () => {
      throw new Error("transport unavailable");
    });
    const pending = f.api.waitForEvent("download");
    // Let a turn pass before attaching our catch: the method itself attaches the suppression handler.
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(pending, /transport unavailable/);
  }
});
async function objectsScenario(impl: any) {
  const f = fixture(impl, (command) => {
    if (command.type === "playwright_download_path") return {};
    throw new Error("set failed");
  });
  const download = new impl.Download({
    browserId: "b",
    tabId: "t",
    downloadId: "d",
    transport: f.transport,
  });
  const chooser = new impl.FileChooser({
    browserId: "b",
    tabId: "t",
    fileChooserId: "f",
    isMultiple: false,
    transport: f.transport,
  });
  const results = [await download.path(), chooser.isMultiple()];
  for (const files of [null, [], ["a"], "b", [1]])
    results.push(await outcome(() => chooser.setFiles(files)));
  return { results, calls: f.calls };
}
test("download path null fallback and file chooser validation/error context match original", async () => {
  assert.deepEqual(await objectsScenario(local), await objectsScenario(old));
});
test("page command schemas retain enums, coordinates, element metadata and raw construction", async () => {
  const pairs = [
    ["WaitForUrl", "ad"],
    ["WaitForLoadState", "dd"],
    ["WaitForTimeout", "bd"],
    ["DomSnapshot", "wd"],
    ["ElementInfo", "Td"],
    ["ElementScreenshot", "Md"],
    ["WaitForDownload", "qd"],
    ["DownloadPath", "Ud"],
    ["WaitForFileChooser", "Jd"],
    ["FileChooserSetFiles", "Qd"],
  ];
  for (const [name, symbol] of pairs) {
    const ours = commands[name],
      theirs = original[symbol];
    for (const payload of [
      {
        browser_id: "b",
        tab_id: "t",
        url: "https://example.com",
        wait_until: "commit",
        state: "load",
        timeout_ms: 1,
        x: 2,
        y: 3,
        download_id: "d",
        file_chooser_id: "f",
        files: ["a"],
      },
      { browser_id: "b", tab_id: "t", timeout_ms: 0, files: [] },
      { browser_id: 1, state: "commit", wait_until: "other", x: Infinity },
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
      {},
      {
        url: "",
        dom_snapshot: "tree",
        data: "AA==",
        path: null,
        download_id: "d",
        file_chooser_id: "f",
        is_multiple: false,
      },
      [
        {
          tagName: "BUTTON",
          preview: "Button",
          selector: {
            candidates: ["button"],
            primary: null,
            frameSelectors: ["iframe"],
          },
          boundingBox: { x: 0, y: 0, width: 2, height: 3 },
        },
      ],
    ])
      assert.deepEqual(
        await outcome(() => ours.ResultSchema.parse(result)),
        await outcome(() => theirs.ResultSchema.parse(result)),
      );
  }
});

test("page, download and file chooser prototypes retain original method order and arity", () => {
  for (const [ours, theirs] of [
    [PlaywrightAPI, original.Nl],
    [PlaywrightDownload, original.$l],
    [PlaywrightFileChooser, original.Zl],
  ]) {
    assert.deepEqual(
      Object.getOwnPropertyNames(ours.prototype),
      Object.getOwnPropertyNames(theirs.prototype),
    );
    for (const name of Object.getOwnPropertyNames(ours.prototype).filter(
      (name) => name !== "constructor",
    ))
      assert.equal(
        ours.prototype[name].length,
        theirs.prototype[name].length,
        name,
      );
  }
});
