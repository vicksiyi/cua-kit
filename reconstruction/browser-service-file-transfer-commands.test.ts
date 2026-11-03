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

test("file chooser commands set real Chromium files, preserve content and clear consumed chooser state", async () => {
  const { chromium } = await import("playwright");
  const { EventEmitter } = await import("node:events");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { waitForCdpEvent } =
    await import("../packages/browser/src/service/cdp/event_wait");
  const directory = await mkdtemp(join(tmpdir(), "cua-file-chooser-"));
  const filename = join(directory, "fixture.txt");
  await writeFile(filename, "临时测试文件🙂", "utf8");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<input id="file" type="file" multiple>');
    const session = await page.context().newCDPSession(page);
    const armed = Promise.withResolvers<void>();
    const cdp: any = new EventEmitter();
    cdp.fileChoosersById = new Map();
    cdp.waitForEvent = waitForCdpEvent.bind(cdp);
    cdp.call = async (_id: number, method: string, params: any) => {
      const response = await session.send(method as any, params);
      if (method === "Page.setInterceptFileChooserDialog" && params.enabled)
        armed.resolve();
      return response;
    };
    session.on("Page.fileChooserOpened", (params) =>
      cdp.emit("event", {
        method: "Page.fileChooserOpened",
        params,
        source: { tabId: 7 },
      }),
    );
    const permissions: string[] = [];
    const authorize = (kind: string) => (_url: unknown) => ({
      assert: async () => {
        permissions.push(kind);
      },
    });
    const context: any = {
      cdp,
      security: {
        currentTabUrl: async () => page.url(),
        currentTabFileTransferUrl: async () => page.url(),
      },
      acquireAuthority: () => ({
        observeContent: authorize("observe"),
        actInFrame: authorize("act"),
        uploadFiles: authorize("upload"),
      }),
    };
    const waiting = chooser({ tab_id: 7, timeout_ms: 3000 }, context);
    await armed.promise;
    await session.send("Runtime.evaluate", {
      expression: 'document.getElementById("file").click()',
      userGesture: true,
    });
    const selected = await waiting;
    assert.equal(selected.is_multiple, true);
    assert.equal(cdp.fileChoosersById.size, 1);
    assert.deepEqual(
      await setFiles(
        {
          tab_id: 7,
          file_chooser_id: selected.file_chooser_id,
          files: [filename],
        },
        context,
      ),
      {},
    );
    const result = await page.evaluate(async () => {
      const file = (document.querySelector("input") as HTMLInputElement)
        .files![0];
      return { name: file.name, text: await file.text() };
    });
    assert.deepEqual(result, { name: "fixture.txt", text: "临时测试文件🙂" });
    assert.deepEqual(permissions, ["observe", "act", "upload"]);
    assert.equal(cdp.fileChoosersById.size, 0);
    assert.equal(cdp.listenerCount("event"), 0);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
