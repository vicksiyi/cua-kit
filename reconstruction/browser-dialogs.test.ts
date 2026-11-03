import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  JsDialog,
  AlertDialog,
  BeforeUnloadDialog,
  ConfirmDialog,
  PromptDialog,
} from "../packages/browser/dist/dialogs.js";
import * as commands from "../packages/browser/dist/commands/tab_control.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {vh,xh,kh,Sh,Th,b as Commands};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}

test("dialogs preserve type override, available methods, exact commands, string-only prompt and failures", async () => {
  async function run(Class: any, method: string, args: any[], fail: boolean) {
    const log: any[] = [];
    const api = new Class({
      browserId: "b",
      dialogId: "d",
      tabId: "t",
      type: "caller-override",
      transport: {
        send: async ({ command }: any) => {
          log.push(command.toJSON());
          if (fail) throw new Error("service failed");
          return { ignored: true };
        },
      },
    });
    const state = {
      type: api.type,
      keys: Object.keys(api),
      hasAccept: "accept" in api,
    };
    return { state, log, result: await outcome(() => api[method](...args)) };
  }
  for (const [Class, Original] of [
    [JsDialog, original.vh],
    [AlertDialog, original.xh],
    [BeforeUnloadDialog, original.kh],
    [ConfirmDialog, original.Sh],
    [PromptDialog, original.Th],
  ])
    for (const method of ["dismiss", "accept"])
      for (const args of [[], [""], ["中"], [null], [5]])
        for (const fail of [false, true])
          assert.deepEqual(
            await run(Class, method, args, fail),
            await run(Original, method, args, fail),
          );
});

test("Tab control command schemas preserve original navigation, handoff, crop and dialog semantics", async () => {
  const inputs = [
    undefined,
    null,
    {},
    [],
    {
      browser_id: "b",
      tab_id: "t",
      url: "not-a-url",
      status: "handoff",
      reason: "authentication",
      fullPage: false,
      cropX: -1,
      cropY: 0,
      cropWidth: 0,
      cropHeight: -1,
      action: "accept",
      dialog_id: "d",
      prompt_text: "",
      extra: 1,
    },
    {
      browser_id: "b",
      tab_id: "t",
      status: "invalid",
      reason: "invalid",
      url: 3,
      fullPage: "no",
      cropX: NaN,
      cropY: Infinity,
      action: "invalid",
      dialog_id: 3,
    },
    { dialog: null },
    { dialog: { id: "d", type: "prompt", extra: 1 } },
    { dialog: { id: "d", type: "unknown" } },
    { data: "AQID" },
  ];
  for (const [name, restored] of Object.entries(commands)) {
    const vendor = original.Commands[name];
    assert.ok(vendor, name);
    for (const input of inputs) {
      assert.deepEqual(
        await outcome(() => restored.create(input).toJSON()),
        await outcome(() => vendor.create(input).toJSON()),
      );
      assert.deepEqual(
        await outcome(() => restored.create(input).parse()),
        await outcome(() => vendor.create(input).parse()),
      );
      assert.deepEqual(
        await outcome(() => restored.ResultSchema.parse(input)),
        await outcome(() => vendor.ResultSchema.parse(input)),
      );
    }
  }
});
