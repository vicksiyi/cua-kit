import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  PlaywrightDownloadPathCommand as path,
  PlaywrightWaitForDownloadCommand as download,
} from "../packages/browser/src/service/commands/downloads";
import {
  PlaywrightWaitForFileChooserCommand as chooser,
  createFileChooserSetFilesCommand,
  fileUploadNotAllowed,
} from "../packages/browser/src/service/commands/file_chooser";
import {
  SECURITY_REJECTED_PREFIX,
  SECURITY_REJECTED_SUFFIX,
} from "../packages/browser/src/service/errors/browser_security_error";
const family = () => ({
  displayName: "Fixture Browser",
  extensionManagementUrl: "fixture://extensions",
});
const setFiles = createFileChooserSetFilesCommand(family);
const original = originalServiceBindings(
  [
    "F",
    "W",
    "Ve",
    "o2",
    "Wh",
    "S2",
    "ere",
    "tre",
    "rre",
    "x2",
    "E2",
    "i2",
    "Jte",
    "el",
  ],
  { ks: family, F8: SECURITY_REJECTED_PREFIX, U8: SECURITY_REJECTED_SUFFIX },
);
async function run(command: any, mode: string) {
  const trace: any[] = [],
    records = new Map<any, any>();
  if (mode !== "unknown")
    records.set("chooser", {
      tabId: mode === "wrong-tab" ? 8 : 7,
      backendNodeId: 42,
      isMultiple: mode !== "single",
    });
  const auth = (kind: string) => (url: string) => {
    trace.push([kind, url]);
    return {
      async assert() {
        trace.push("assert");
        if (mode === "denied") throw Error("denied");
      },
    };
  };
  const context: any = {
    acquireAuthority() {
      trace.push("authority");
      return {
        observeContent: auth("observe"),
        actInFrame: auth("act"),
        uploadFiles: auth("upload"),
      };
    },
    security: {
      async currentTabUrl(id: number) {
        trace.push(["url", id]);
        return "https://fixture.test/";
      },
      async currentTabFileTransferUrl(id: number, direction: string) {
        trace.push(["transfer", id, direction]);
        return "https://upload.test/";
      },
    },
    finishDownloadSetup() {
      trace.push("finish-setup");
    },
    downloads: {
      getPath(id: string) {
        trace.push(["path", id]);
        return "/fixture/download";
      },
      async withDownload(id: number, fn: any) {
        trace.push(["with", id]);
        try {
          return await fn();
        } finally {
          trace.push("release");
        }
      },
      async enableDownload(id: number) {
        trace.push(["enable", id]);
        if (mode === "error") throw Error("enable failed");
      },
      async waitForDownload(id: number, timeout: number) {
        trace.push(["download-wait", id, timeout]);
        return { id: "download" };
      },
    },
    cdp: {
      fileChoosersById: records,
      async call(id: number, method: string, params: any) {
        trace.push(["call", id, method, params]);
        if (method === "DOM.setFileInputFiles" && mode === "not-allowed")
          throw Error('{"code":-32000,"message":"Not allowed"}');
        if (mode === "error") throw Error("CDP failed");
      },
      async waitForEvent(id: number, predicate: any, options: any) {
        trace.push(["wait", id, options.timeoutMs]);
        await options.action();
        const event = {
          method: "Page.fileChooserOpened",
          params: { backendNodeId: 42, mode: "selectMultiple" },
          source: {
            tabId: 7,
            ...(mode === "nested" ? { sessionId: "child" } : {}),
          },
        };
        trace.push(["predicate", predicate(event)]);
        if (mode === "timeout") throw Error(options.timeoutMessage);
        return event;
      },
    },
  };
  const payload = {
    tab_id: mode === "invalid-tab" ? 0 : 7,
    download_id: mode === "unknown" ? "" : "download",
    file_chooser_id: "chooser",
    files: mode === "empty" ? [] : ["/fixture/a", "/fixture/b"],
    timeout_ms: mode === "timeout" ? 0 : 200000,
  };
  let result;
  try {
    result = { value: await command(payload, context) };
  } catch (e) {
    result = { error: (e as Error).message };
  }
  return JSON.parse(
    JSON.stringify({ ...result, trace, records: [...records] }).replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      "UUID",
    ),
  );
}
test("download and file chooser commands match original authority, setup, ownership, validation and cleanup", async () => {
  for (const [command, reference] of [
    [path, original.o2],
    [download, original.Wh],
    [chooser, original.S2],
    [setFiles, original.i2],
  ])
    for (const mode of [
      "normal",
      "denied",
      "error",
      "unknown",
      "wrong-tab",
      "single",
      "not-allowed",
      "nested",
      "timeout",
      "invalid-tab",
      "empty",
    ])
      assert.deepEqual(
        await run(command, mode),
        await run(reference, mode),
        `${command.type}/${mode}`,
      );
  assert.deepEqual((await run(setFiles, "normal")).records, []);
  assert.equal((await run(setFiles, "not-allowed")).records.length, 1);
  assert.ok(
    (await run(download, "normal")).trace.some(
      (row: any) => row[0] === "download-wait" && row[2] === 120000,
    ),
  );
  assert.ok(
    (await run(chooser, "timeout")).trace.some(
      (row: any) =>
        row[2] === "Page.setInterceptFileChooserDialog" &&
        row[3].enabled === false,
    ),
  );
  for (const error of [
    "Not allowed",
    Error("Not allowed"),
    '{"code":-32000,"message":"Not allowed"}',
    '{"code":1,"message":"Not allowed"}',
    null,
    {},
    "bad",
  ])
    assert.equal(fileUploadNotAllowed(error), original.Jte(error));
});
