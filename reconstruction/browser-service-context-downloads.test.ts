import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source.ts";
import {
  Downloads,
  downloadSourceOrigin,
  downloadResponseOverrides,
} from "../packages/browser/dist/service/context/downloads.js";
import { CdpEventEmitter } from "../packages/browser/dist/service/cdp/event_emitter.js";
const source = originalServiceBindings([
  "Lt",
  "UB",
  "IX",
  "Es",
  "qB",
  "qe",
  "dS",
  "jF",
  "HF",
  "pS",
  "coe",
  "poe",
  "doe",
  "loe",
  "pg",
]);
function fixture(Class: any, clientType = "cdp") {
  const trace: any[] = [],
    responses = new CdpEventEmitter() as any;
  let listener: any, tracker: any;
  const api = {
    addEventListener(name: string, fn: any) {
      listener = fn;
    },
    matchesCurrentSessionId: (id: string) => id === "current",
    supportsBlobDownloads: async () => true,
    getCommittedTabUrl: async () => "https://example.com/page",
    setBlobDownloadOrigin: async (...args: any[]) => {
      trace.push(["blob", ...args]);
    },
    allowDownload: async (args: any) => {
      trace.push(["allow", args]);
    },
  };
  const security = {
    currentTabFileTransferUrl: async () => "https://example.com/page",
    createAuthorityBuilder: () => ({
      downloadFiles: (args: any) => ({
        assert: async () => {
          trace.push(["authorize", args]);
        },
      }),
    }),
  };
  responses.failResponse = async (...args: any[]) => {
    trace.push(["fail", ...args]);
  };
  responses.continueResponse = async (...args: any[]) => {
    trace.push(["continue", ...args]);
  };
  responses.addRequestInterceptor = async (_: any, fn: any) => {
    tracker = fn;
    return async () => {
      trace.push(["stop"]);
    };
  };
  const instance = new Class(api, responses, security, clientType);
  return {
    instance,
    api,
    responses,
    security,
    trace,
    emit: (event: any) => listener(event),
    track: (request: any) => tracker(request),
  };
}
function response(url = "https://other.com/file", type = "application/pdf") {
  return {
    requestId: "r",
    request: { url },
    frameId: "f",
    resourceType: "Document",
    responseStatusCode: 200,
    responseStatusText: "OK",
    responseHeaders: [{ name: "Content-Type", value: type }],
  };
}
test("download classification, attachment overrides and authority keys match installed predicates", () => {
  const readable = fixture(Downloads).instance,
    original = fixture(source.pg).instance;
  for (const type of [
    undefined,
    "",
    "text/html",
    "application/json",
    "application/x+json",
    "application/pdf",
    "image/png",
    "video/mp4",
    "audio/wav",
    "application/octet-stream",
  ]) {
    for (const intended of [false, true])
      for (const code of [200, 301, 302, 303, 304, 307, 308]) {
        const r: any = response();
        r.responseStatusCode = code;
        r.responseHeaders =
          type === undefined
            ? undefined
            : [
                { name: "Content-Type", value: type },
                { name: "Location", value: "/redirect" },
              ];
        assert.equal(
          readable.isDownload(r, intended),
          original.isDownload(r, intended),
        );
        assert.deepEqual(downloadResponseOverrides(r), source.loe(r));
      }
  }
  for (const disposition of [
    "inline; filename=a.pdf",
    "ATTACHMENT ;filename=x",
    "attachmentx",
    "inline",
  ]) {
    const r = response();
    r.responseHeaders.push({ name: "Content-Disposition", value: disposition });
    assert.deepEqual(downloadResponseOverrides(r), source.loe(r));
  }
  for (const value of [
    null,
    "",
    "invalid",
    "file:///tmp/a?q=1#x",
    "https://example.com/a",
    "blob:https://example.com/a",
    "codex-sandbox://a.web-sandbox.oaiusercontent.com/path",
    "codex-sandbox://bad.com/path",
    "https://u:p@example.com/path",
  ])
    assert.equal(downloadSourceOrigin(value), source.qe(value));
});
test("HTTP downloads retain authorization/allow/continue/completion ordering and session filtering", async () => {
  async function run(Class: any, clientType: string) {
    const f = fixture(Class, clientType),
      o = f.instance;
    await o.enableDownload(1);
    let claimed = false;
    f.responses.emit("intercept", 1, response(), () => {
      claimed = true;
    });
    const waiting = o.waitForDownload(1, 2000);
    // Flush the deterministic authorization + continuation chain, without relying on elapsed time.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const base = {
      id: "id",
      filename: "/tmp/file",
      url: "https://other.com/file",
      tabId: 1,
    };
    f.emit({ ...base, status: "started", session_id: "wrong" });
    f.emit({ ...base, status: "complete" });
    f.emit({ ...base, status: "started" });
    f.emit({ ...base, id: "wrong-id", status: "complete" });
    f.emit({ ...base, status: "complete" });
    const result = await waiting;
    return {
      trace: f.trace,
      claimed,
      result,
      path: o.getPath("id"),
      count: o.downloadsByTab.size,
      fields: Object.keys(o),
    };
  }
  for (const clientType of ["cdp", "iab", "extension"])
    assert.deepEqual(
      await run(Downloads, clientType),
      await run(source.pg, clientType),
    );
});
test("media tracking follows only matching frame and redirect chain; blob downloads require matching origin", async () => {
  async function run(Class: any) {
    const f = fixture(Class),
      o = f.instance;
    await o.enableMediaDownload(1, "https://example.com/media#fragment", "f");
    for (const r of [
      { ...response("https://example.com/media"), frameId: "wrong" },
      response("https://example.com/media"),
      {
        ...response("https://other.com/media"),
        requestId: "r2",
        redirectedRequestId: "r",
      },
      {
        ...response("https://other.com/media"),
        requestId: "r3",
        redirectedRequestId: "unknown",
      },
    ])
      f.track(r);
    const tracked = [...o.getDownload(1).intent.requestIds];
    await o.disableDownload(1);
    await assert.rejects(
      o.enableMediaDownload(1, "blob:https://wrong.com/id", "f"),
      /current website/,
    );
    await o.disableDownload(1);
    const url = "blob:https://example.com/id";
    await o.enableMediaDownload(1, url, "f");
    const base = { id: "blob", filename: "/tmp/blob", url, tabId: 1 };
    f.emit({ ...base, tabId: 2, status: "started" });
    f.emit({ ...base, status: "started" });
    const waiting = o.waitForDownload(1, 2000);
    f.emit({ ...base, status: "complete" });
    const result = await waiting;
    return {
      trace: f.trace,
      tracked,
      result,
      path: o.getPath("blob"),
      count: o.downloadsByTab.size,
    };
  }
  assert.deepEqual(await run(Downloads), await run(source.pg));
});
test("download blocking, cancellation, timeout and nested actions retain cleanup behavior", async () => {
  async function run(Class: any) {
    const f = fixture(Class),
      o = f.instance,
      errors: string[] = [];
    const capture = async (action: () => Promise<any>) => {
      try {
        await action();
      } catch (error: any) {
        errors.push(error.message);
      }
    };
    let blocked = false;
    f.responses.emit(
      "intercept",
      1,
      response("https://example.com/a", "application/octet-stream"),
      () => {
        blocked = true;
      },
    );
    await capture(() =>
      o.withDownload(1, () => o.withDownload(1, async () => {})),
    );
    await capture(() => o.waitForDownload(1, 1));
    await o.enableDownload(1);
    const url = "blob:https://example.com/id",
      base = { id: "b", filename: "/tmp/b", url, tabId: 1 };
    f.emit({ ...base, status: "started" });
    f.emit({ ...base, status: "canceled" });
    await capture(() => o.waitForDownload(1, 2000));
    await o.enableMediaDownload(1, "https://example.com/a", "f");
    f.track(response("https://example.com/a"));
    f.responses.emit(
      "intercept",
      1,
      response("https://example.com/a"),
      () => {},
    );
    f.api.setBlobDownloadOrigin = async () => {
      throw Error("cleanup");
    };
    // Pending HTTP response must be failed and tracker removed on disable.
    await o.disableDownload(1);
    return {
      errors,
      blocked,
      trace: f.trace,
      count: o.downloadsByTab.size,
      active: o.activeDownloadTabs.size,
    };
  }
  assert.deepEqual(await run(Downloads), await run(source.pg));
});
