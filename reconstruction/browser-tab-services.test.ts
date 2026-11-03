import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ContentAPI } from "../packages/browser/dist/content.js";
import { TabClipboardAPI } from "../packages/browser/dist/clipboard.js";
import { TabDevAPI } from "../packages/browser/dist/dev.js";
import * as commands from "../packages/browser/dist/commands/tab_services.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {Ul,zl,Vl,zi,Gi,ts,ns,us,_s,ks,ji};").toString("base64")}`
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
  args: any[],
  response: any,
  fail = false,
) {
  const log: any[] = [];
  const api = new Class({
    browserId: "b",
    tabId: "t",
    transport: {
      send: async ({ command }: any) => {
        log.push(command.toJSON());
        if (fail) throw new Error("service failed");
        return response;
      },
    },
  });
  return { result: await outcome(() => api[method](...args)), log };
}

test("content exports preserve raw formats, returned paths and original errors", async () => {
  for (const [method, args] of [
    ["export", []],
    ["exportGsuite", ["pdf"]],
    ["exportGsuite", ["invalid"]],
    ["exportGsuite", [null]],
    ["exportYouTubeTranscript", []],
  ] as any)
    for (const response of [{ path: "/tmp/document" }, { path: 42 }, {}, null])
      for (const fail of [false, true])
        assert.deepEqual(
          await run(ContentAPI, method, args, response, fail),
          await run(original.Ul, method, args, response, fail),
        );
});

test("clipboard client preserves exact field projection without moving schema validation into the client", async () => {
  const writeItems = [
    {
      presentationStyle: "inline",
      entries: [
        { mimeType: "text/plain", text: "text", extra: 1 },
        { mimeType: "image/png", base64: "AQID" },
      ],
    },
  ];
  const cases = [
    ["readText", []],
    ["writeText", [""]],
    ["writeText", [null]],
    ["writeText", [5]],
    ["read", []],
    ["write", [writeItems]],
    ["write", [[]]],
    ["write", [null]],
    [
      "write",
      [[{ entries: [{ mimeType: "text/plain", text: "a", base64: "b" }] }]],
    ],
    ["write", [[{ entries: [] }]]],
    ["write", [[{}]]],
  ];
  const responses = [
    {
      text: "text",
      items: [
        {
          presentation_style: "attachment",
          entries: [
            { mime_type: "text/plain", text: "hello", extra: 1 },
            { mime_type: "image/png", base64: "AQID" },
          ],
        },
      ],
    },
    { text: 7, items: [] },
    {
      items: [
        { entries: [{ mime_type: "text/plain", text: "a", base64: "b" }] },
      ],
    },
    {},
    null,
  ];
  for (const [method, args] of cases as any)
    for (const response of responses)
      assert.deepEqual(
        await run(TabClipboardAPI, method, args, response),
        await run(original.zl, method, args, response),
      );
  assert.deepEqual(
    await run(TabClipboardAPI, "write", [writeItems], {}, true),
    await run(original.zl, "write", [writeItems], {}, true),
  );
});

test("dev logs preserves warning alias, omission, validator order and response projection", async () => {
  const options = [
    undefined,
    {},
    null,
    {
      filter: "",
      levels: ["warning", "warn", "debug", "info", "log", "error"],
      limit: 1,
    },
    { filter: null, levels: null, limit: null },
    { filter: 2, levels: [], limit: 0 },
    { levels: [] },
    { levels: ["WARN"] },
    { levels: [null] },
    { levels: [Symbol("level")] },
    { limit: 0 },
    { limit: -1 },
    { limit: 1.5 },
    { limit: Infinity },
    { limit: "2" },
  ];
  for (const option of options)
    for (const response of [
      { logs: [{ level: "log", message: "m" }] },
      {},
      null,
    ]) {
      assert.deepEqual(
        await run(TabDevAPI, "logs", [option], response),
        await run(original.Vl, "logs", [option], response),
      );
    }
});

test("tab service schemas match export formats, log enums, clipboard exclusive data and empty item rules", async () => {
  const pairs = [
    [commands.ContentExportCommand, original.zi],
    [commands.ContentExportGsuiteCommand, original.Gi],
    [commands.ContentExportYouTubeTranscriptCommand, original.ts],
    [commands.ClipboardReadTextCommand, original.ns],
    [commands.ClipboardWriteTextCommand, original.us],
    [commands.ClipboardReadCommand, original._s],
    [commands.ClipboardWriteCommand, original.ks],
    [commands.DevLogsCommand, original.ji],
  ];
  const inputs = [
    undefined,
    null,
    {},
    [],
    { browser_id: "b", tab_id: "t", format: "docx", text: "text", extra: 1 },
    {
      browser_id: "b",
      tab_id: "t",
      format: "invalid",
      levels: ["warning"],
      limit: 0,
    },
    {
      path: "file",
      text: "hello",
      logs: [{ level: "warn", message: "m", timestamp: "now", extra: 1 }],
    },
    ...[
      [],
      [{ entries: [] }],
      [{ entries: [{ mime_type: "text/plain", text: "" }] }],
      [
        {
          entries: [{ mime_type: "image/png", base64: "" }],
          presentation_style: "attachment",
        },
      ],
      [{ entries: [{ mime_type: "text/plain" }] }],
      [{ entries: [{ mime_type: "text/plain", text: "x", base64: "y" }] }],
      [{ entries: [{ mime_type: 1, text: "x" }], presentation_style: "bad" }],
    ].map((items) => ({ browser_id: "b", tab_id: "t", items })),
  ];
  for (const [restored, vendor] of pairs)
    for (const input of inputs) {
      assert.deepEqual(
        await outcome(() => restored.create(input).parse()),
        await outcome(() => vendor.create(input).parse()),
      );
      assert.deepEqual(
        await outcome(() => restored.create(input).toJSON()),
        await outcome(() => vendor.create(input).toJSON()),
      );
      assert.deepEqual(
        await outcome(() => restored.ResultSchema.parse(input)),
        await outcome(() => vendor.ResultSchema.parse(input)),
      );
    }
});
