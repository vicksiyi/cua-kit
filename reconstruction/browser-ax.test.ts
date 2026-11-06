import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AxClient } from "../packages/browser/src/ax";
import {
  ActionCommand,
  StateCommand,
} from "../packages/browser/src/commands/ax";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const bundle = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
assert.equal(
  createHash("sha256").update(bundle).digest("hex"),
  "04d63754bb1134eae351c164e750c7a9b798de2757a734e7a62e14b63edf8de4",
  "Re-audit AX bindings when the installed client changes",
);
// Test-only exports expose the ORIGINAL lexical classes without replacing their dependencies.
const original = await import(
  `data:text/javascript;base64,${Buffer.from(bundle + "\nexport {Hl as AxClient,zn as StateCommand,Gn as ActionCommand};").toString("base64")}`
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
    { state: "AX", screenshot_unavailable: "Page unavailable", snapshotId: "id", siwc: {status: "unavailable", reason: "page_changed"} },
    { state: "AX" },
    { data: "AQID" },
    {},
    { state: "AX", data: "%%%" },
  ])
    for (const mode of [undefined, "state", "screenshot", "both", "invalid"])
      for (const method of ["get", "write"])
        for (const options of [undefined, {}, {disableDiffing: false}, {disableDiffing: true}]) {
        assert.deepEqual(
          await run(AxClient, result, method, [
            mode,
            options,
          ]),
          await run(original.AxClient, result, method, [
            mode,
            options,
          ]),
          `${method}:${mode}:${JSON.stringify(options)}:${JSON.stringify(result)}`,
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
