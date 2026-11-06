import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CUAAPI } from "../packages/browser/src/cua";
import { DomCUAAPI } from "../packages/browser/src/dom_cua";
import * as commands from "../packages/browser/src/commands/cua_input";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  "04d63754bb1134eae351c164e750c7a9b798de2757a734e7a62e14b63edf8de4",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {Gl as CUAAPI,Wl as DomCUAAPI,d as Commands};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
async function run(
  Class: any,
  method: string,
  arg: any,
  parse = false,
  fail = false,
) {
  const log: any[] = [];
  const result = { dom: "fixture", extra: 1 };
  const api = new Class({
    browserId: "b",
    tabId: "t",
    transport: {
      send: async ({ command, timeoutMs }: any) => {
        log.push({ raw: command.toJSON(), timeoutMs });
        if (parse) log.push(command.parse());
        if (fail) throw new Error("service failed");
        return result;
      },
    },
  });
  return { outcome: await outcome(() => api[method](arg)), log };
}

test("CUA input client preserves local checks, field mapping, omitted values and download timeout forwarding", async () => {
  const options = [
    undefined,
    null,
    {},
    {
      x: 1,
      y: 2,
      button: 2,
      keypress: ["Shift"],
      keys: ["Alt"],
      scrollX: 3,
      scrollY: -4,
      text: "中",
      path: [{ x: 1, y: 2 }],
      timeoutMs: 500,
    },
    {
      x: NaN,
      y: Infinity,
      scrollX: NaN,
      scrollY: Infinity,
      keys: [1],
      path: [{ x: NaN, y: Infinity }],
    },
    { x: "1", y: 2, keys: [], text: "", path: [] },
    { x: 1, y: 2, keys: ["A"], path: [{}], timeoutMs: 0 },
    { path: Array(1), keys: ["Shift"] },
    ...[undefined, 0, 0.001, 0.25, 30, 31, -1, Infinity, NaN, "1", null].map(
      (duration) => ({ keys: ["Enter"], duration }),
    ),
  ];
  for (const method of [
    "click",
    "scroll",
    "double_click",
    "type",
    "keypress",
    "drag",
    "move",
    "downloadMedia",
  ])
    for (const arg of options)
      for (const parse of [false, true])
        assert.deepEqual(
          await run(CUAAPI, method, arg, parse),
          await run(original.CUAAPI, method, arg, parse),
          method,
        );
  assert.deepEqual(
    await run(CUAAPI, "click", { x: 1, y: 2 }, false, true),
    await run(original.CUAAPI, "click", { x: 1, y: 2 }, false, true),
  );
});

test("DOM CUA client preserves node-id messages, optional scroll target and async destructuring failures", async () => {
  const inputs = [
    undefined,
    null,
    {},
    {
      node_id: "1",
      x: 2,
      y: 3,
      keys: ["Enter"],
      text: "hello",
      timeoutMs: 500,
    },
    { node_id: "", x: 1, y: 2, keys: [], text: "" },
    { node_id: 1, x: NaN, y: Infinity, keys: [1], text: 4 },
    { node_id: null, x: 1, y: 2 },
    { node_id: undefined, x: 1, y: 2, timeoutMs: 0 },
    { node_id: "   ", x: "1", y: 2, timeoutMs: -1 },
  ];
  for (const method of [
    "get_visible_dom",
    "click",
    "double_click",
    "scroll",
    "type",
    "keypress",
    "downloadMedia",
  ])
    for (const arg of inputs)
      for (const parse of [false, true])
        assert.deepEqual(
          await run(DomCUAAPI, method, arg, parse),
          await run(original.DomCUAAPI, method, arg, parse),
          `${method}/${JSON.stringify(arg)}`,
        );
});

test("input schemas directly extracted from source preserve original command payload/result behavior", async () => {
  const inputs = [
    undefined,
    null,
    {},
    [],
    {
      browser_id: "b",
      tab_id: "t",
      x: 1,
      y: 2,
      button: 3,
      keys: [],
      path: [],
      text: "",
      node_id: "1",
      scroll_x: 3,
      scroll_y: 4,
      timeout_ms: 1,
      extra: 1,
    },
    {
      browser_id: "b",
      tab_id: "t",
      x: NaN,
      y: Infinity,
      node_id: 3,
      path: [{}],
      keys: [3],
      text: null,
      timeout_ms: 0,
    },
    {
      browser_id: "b",
      tab_id: "t",
      x: Infinity,
      y: -Infinity,
      node_id: "",
      keys: ["Shift"],
      path: [{ x: 1, y: 2, extra: 1 }],
    },
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

test("keypress duration schema preserves finite 0..30 seconds in both client and service contract", async () => {
  for (const duration of [
    undefined,
    0,
    0.001,
    30,
    31,
    -1,
    Infinity,
    NaN,
    "1",
    null,
  ]) {
    const payload = { browser_id: "b", tab_id: "t", keys: ["Enter"], duration };
    assert.deepEqual(
      await outcome(() => commands.CuaKeypress.PayloadSchema.parse(payload)),
      await outcome(() =>
        original.Commands.CuaKeypress.PayloadSchema.parse(payload),
      ),
    );
  }
});
