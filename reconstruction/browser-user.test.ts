import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BrowserUser } from "../packages/browser/dist/browser_user.js";
import * as commands from "../packages/browser/dist/commands/browser_user.js";
const root =
  process.env.CUA_VENDOR_ROOT ??
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai";
const source = await readFile(
  `${root}/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js`,
  "utf8",
);
const original = await import(
  `data:text/javascript;base64,${Buffer.from(source + "\nexport {ll as BrowserUser,ni,ui,_i};").toString("base64")}`
);
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: { name: e.name, message: e.message } };
  }
}
const contexts = [
  {
    kind: "text",
    text: "网页",
    title: "title",
    truncated: false,
    url: "url",
    extra: 1,
  },
  {
    kind: "library_file",
    libraryFileId: "lib",
    fileId: "file",
    fileName: "f",
    mimeType: "text/plain",
    title: "title",
    url: "url",
    extra: 1,
  },
  ...["AQID", "", "%%%"].map((dataBase64) => ({
    kind: "document",
    dataBase64,
    fileName: "f",
    mimeType: "application/pdf",
    title: "title",
    url: "url",
    extra: 1,
  })),
  {
    kind: "library_file",
    libraryFileId: "",
    fileId: "file",
    fileName: "f",
    mimeType: "type",
    title: "title",
    url: "url",
  },
  {},
  null,
];

test("BrowserUser matches original id handling, claim factory, result projection and document decoding", async () => {
  async function run(
    Class: any,
    method: string,
    arg: any,
    response: any,
    fail = false,
  ) {
    const log: any[] = [];
    const user = new Class({
      browserId: "b",
      createTab: function (payload: any) {
        log.push(["factory", payload, this === user]);
        return { bound: payload };
      },
      transport: {
        send: async ({ command }: any) => {
          log.push(command.toJSON());
          if (fail) throw new Error("service failed");
          return response;
        },
      },
    });
    return { result: await outcome(() => user[method](arg)), log };
  }
  for (const id of [
    "t",
    "",
    { id: "t" },
    { id: "" },
    null,
    undefined,
    {},
    4,
    { id: 4 },
    Object.create({ id: "inherited" }),
  ]) {
    for (const response of contexts)
      assert.deepEqual(
        await run(BrowserUser, "getTabContext", id, response),
        await run(original.BrowserUser, "getTabContext", id, response),
      );
    for (const fail of [false, true])
      assert.deepEqual(
        await run(
          BrowserUser,
          "claimTab",
          id,
          { id: "claimed", extra: 1 },
          fail,
        ),
        await run(
          original.BrowserUser,
          "claimTab",
          id,
          { id: "claimed", extra: 1 },
          fail,
        ),
      );
  }
  for (const response of [{ tabs: [{ id: "1", extra: 1 }] }, {}, null])
    assert.deepEqual(
      await run(BrowserUser, "openTabs", undefined, response),
      await run(original.BrowserUser, "openTabs", undefined, response),
    );
});

test("BrowserUser commands retain discriminated schema errors and raw construction", async () => {
  for (const [restored, vendor] of [
    [commands.UserClaimTabCommand, original.ni],
    [commands.UserGetTabContextCommand, original.ui],
    [commands.UserOpenTabsCommand, original._i],
  ])
    for (const input of [
      ...contexts,
      undefined,
      { browser_id: "b", tab_id: "t", extra: 1 },
      { tabs: [{ id: "t", lastOpened: "date", tabGroup: "group", extra: 1 }] },
    ]) {
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
