import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AxClient } from "../packages/browser/dist/ax.js";
import {
  ActionCommand,
  StateCommand,
} from "../packages/browser/dist/commands/ax.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const bundle = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
// Test-only exports expose the ORIGINAL lexical classes without replacing their dependencies.
const original = await import(
  `data:text/javascript;base64,${Buffer.from(bundle + "\nexport {Fl as AxClient,$s as StateCommand,Ls as ActionCommand};").toString("base64")}`
);

test("AX capture client matches original transport, decoding, display and missing-data paths", async () => {
  async function run(Class: any, result: any, method: string, args: any[]) {
    const log: any[] = [];
    const api = new Class({
      browserId: "b",
      tabId: "t",
      transport: {
        send: async ({ command }: any) => {
          log.push(["send", command.toJSON(), command.parse()]);
          return result;
        },
        display: async (value: any) => {
          log.push(["display", value]);
        },
      },
    });
    try {
      return { value: await api[method](...args), log };
    } catch (e) {
      return {
        error: { name: (e as Error).name, message: (e as Error).message },
        log,
      };
    }
  }
  for (const result of [
    { state: "AX", data: "AQID" },
    { state: "AX", screenshot_unavailable: "" },
    { state: "AX" },
    { data: "AQID" },
    {},
    { state: "AX", data: "%%%" },
  ])
    for (const mode of ["state", "screenshot", "both", "invalid"])
      for (const method of ["get", "write"]) {
        assert.deepEqual(
          await run(AxClient, result, method, [
            mode,
            { disableDiffing: false },
          ]),
          await run(original.AxClient, result, method, [
            mode,
            { disableDiffing: false },
          ]),
          `${method}:${mode}:${JSON.stringify(result)}`,
        );
      }
});
test("AX actions preserve command payloads, omitted fields and validator errors", async () => {
  const calls: Array<[string, any[]]> = [
    ["click", [5]],
    [
      "click",
      [
        [1, 2],
        { mouseButton: "r", clickCount: 2, key: "Shift", duration: 0.25 },
      ],
    ],
    ["click", [-1]],
    ["click", [1, { duration: 31 }]],
    [
      "drag",
      [
        [1, 2],
        [3, 4],
      ],
    ],
    ["drag", [[1], [3, 4]]],
    ["paste", [null, "text"]],
    ["paste", [0, "html", { format: "html" }]],
    ["paste", [-1, "text"]],
    ["pressKey", [null, "Enter", { duration: 0 }]],
    ["pressKey", [null, "Enter", { duration: Infinity }]],
    ["scroll", [1, "u", -2]],
    ["scroll", [[1, 2], "invalid"]],
    [
      "selectText",
      [1, "text", { prefix: "a", suffix: "b", selectionType: "cursor_before" }],
    ],
    ["selectText", [1, "text", { selectionType: "word" }]],
    ["setValue", [0, "v"]],
    ["typeText", [null, "t"]],
    ["performSecondaryAction", [1, "press"]],
  ];
  async function run(Class: any, method: string, args: any[]) {
    const log: any[] = [];
    const api = new Class({
      browserId: "b",
      tabId: "t",
      transport: {
        send: async ({ command }: any) => {
          log.push(command.toJSON());
          log.push(command.parse());
          return {};
        },
        display: async () => {},
      },
    });
    try {
      return { value: await api[method](...args), log };
    } catch (e) {
      return {
        error: JSON.parse(JSON.stringify(e)),
        name: (e as Error).name,
        message: (e as Error).message,
        log,
      };
    }
  }
  for (const [method, args] of calls)
    assert.deepEqual(
      await run(AxClient, method, args),
      await run(original.AxClient, method, args),
      method,
    );
});
test("command creation keeps raw payload and defers parse, including type property precedence", () => {
  for (const [restored, vendor, payload] of [
    [
      StateCommand,
      original.StateCommand,
      {
        browser_id: "b",
        tab_id: "t",
        content: "axState",
        extra: 1,
        type: "override",
      },
    ],
    [
      ActionCommand,
      original.ActionCommand,
      {
        browser_id: "b",
        tab_id: "t",
        action: { kind: "click", target: 0, extra: 1 },
        extra: 1,
      },
    ],
  ] as any) {
    const a = restored.create(payload),
      b = vendor.create(payload);
    assert.equal(a.payload, payload);
    assert.equal(b.payload, payload);
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.deepEqual(a.parse(), b.parse());
  }
});
