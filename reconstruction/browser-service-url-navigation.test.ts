import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import {
  createNavigateTabUrlCommand,
  navigationCompletionPredicate,
} from "../packages/browser/src/service/commands/url_navigation";
import { rejectBlockedNavigation } from "../packages/browser/src/service/cdp/page_load";
const symbols = [
  "F",
  "YN",
  "KN",
  "Nte",
  "XN",
  "Fte",
  "Lte",
  "Ute",
  "qte",
  "Hh",
  "jte",
  "Hte",
  "Iv",
  "Io",
  "Hn",
  "Rv",
];
async function run(useOriginal: boolean, mode: string) {
  const trace: any[] = [],
    cdp: any = new EventEmitter();
  const reset = async (_owner: object, id: number) => {
    trace.push(["reset", id]);
  };
  const command = useOriginal
    ? originalServiceBindings(symbols, {
        GD: reset,
        Wn: rejectBlockedNavigation,
        wte: "Page.navigationBlocked",
      }).YN
    : createNavigateTabUrlCommand(reset);
  let reads = 0,
    session = "a",
    predicate: any,
    finish: any;
  const wait = Promise.withResolvers<any>();
  const old = { id: "root", loaderId: "old", url: "https://old.test/" };
  let current: any = old;
  cdp.readDocumentState = async () => {
    trace.push("document");
    return { href: old.url };
  };
  cdp.waitForEvent = (_id: number, p: any, options: any) => {
    predicate = p;
    finish = wait.resolve;
    trace.push(["wait", options.timeoutMs]);
    options.signal.addEventListener("abort", () => trace.push("abort"));
    return wait.promise;
  };
  const emit = (method: string, params: any, source: any = { tabId: 7 }) => {
    const e = { method, params, source };
    cdp.emit("event", e);
    if (predicate?.(e)) finish(e);
  };
  cdp.call = async (_id: number, method: string, params: any) => {
    trace.push(["call", method, params]);
    if (method === "Page.getFrameTree") {
      reads++;
      if (mode === "frame-error") throw Error("no frame");
      if (mode === "refresh-race" && reads === 2) {
        current = { ...current, loaderId: "race" };
        emit("Page.frameNavigated", { frame: current });
        return { frameTree: { frame: { ...current, loaderId: "new" } } };
      }
      return { frameTree: { frame: current } };
    }
    if (method !== "Page.navigate") return {};
    if (mode === "cdp-error") throw Error("dispatch failed");
    if (mode === "reported-error") return { errorText: `failed ${params.url}` };
    current = {
      id: mode === "wrong-frame" ? "other" : "root",
      loaderId:
        mode === "unchanged-loader"
          ? "old"
          : mode === "wrong-loader"
            ? "other"
            : "new",
      url: params.url,
    };
    emit("Page.frameStartedNavigating", {
      frameId: "root",
      loaderId: mode === "start-mismatch" ? "different" : "new",
      navigationType:
        mode === "same-document" ? "sameDocument" : "differentDocument",
    });
    emit("Page.frameNavigated", { frame: current });
    if (mode === "detached") cdp.emit("tabDetached", 7);
    if (mode === "session-changed") session = "b";
    if (mode === "timeout") wait.reject(Error("timeout"));
    else if (mode === "blocked")
      emit("Page.navigationBlocked", {
        url: params.url,
        resourceType: "mainFrame",
      });
    else {
      emit("Page.frameStartedLoading", { frameId: "root" });
      emit("Page.loadEventFired", {});
      if (mode === "frame-error") finish(undefined);
    }
    return {
      frameId: "root",
      loaderId: mode === "missing-loader" ? undefined : "new",
      isDownload: mode === "download",
    };
  };
  const gate =
    mode === "no-gate"
      ? undefined
      : {
          epoch: 4,
          permitNavigatedDocument(...args: any[]) {
            trace.push(["permit", ...args]);
          },
        };
  const context: any = {
    cdp,
    documentResponses: {},
    credentialObservationGate: gate,
    getCurrentSessionId() {
      trace.push("session");
      return session;
    },
    acquireAuthority() {
      trace.push("authority");
      return {
        triggerNetworkEgress(url: string) {
          trace.push(["egress", url]);
          return {
            async assert() {
              trace.push("assert");
              if (mode === "denied") throw Error("denied");
            },
          };
        },
      };
    },
    async followSessionTab(id: number) {
      trace.push(["follow", id]);
    },
  };
  let result;
  try {
    result = {
      value: await command(
        {
          tab_id: mode === "invalid-tab" ? 0 : 7,
          url:
            mode === "invalid-url"
              ? ""
              : "https://user:pass@dest.test/path?q=secret#hash",
          timeout_ms: 123,
        },
        context,
      ),
    };
  } catch (e) {
    result = { error: (e as Error).message };
  }
  assert.equal(cdp.listenerCount("event"), 0);
  assert.equal(cdp.listenerCount("tabDetached"), 0);
  return { ...result, trace };
}
test("URL navigation matches original authorization, loader races, errors and cleanup", async () => {
  for (const mode of [
    "normal",
    "no-gate",
    "invalid-tab",
    "invalid-url",
    "denied",
    "cdp-error",
    "reported-error",
    "frame-error",
    "refresh-race",
    "wrong-frame",
    "wrong-loader",
    "unchanged-loader",
    "start-mismatch",
    "same-document",
    "detached",
    "session-changed",
    "timeout",
    "blocked",
    "missing-loader",
    "download",
  ]) {
    const actual = await run(false, mode);
    assert.deepEqual(actual, await run(true, mode), mode);
    if (mode === "normal")
      assert.ok(actual.trace.some((row) => row[0] === "permit"));
    if (
      [
        "refresh-race",
        "wrong-frame",
        "wrong-loader",
        "unchanged-loader",
        "start-mismatch",
        "detached",
        "session-changed",
        "missing-loader",
        "download",
      ].includes(mode)
    )
      assert.equal(
        actual.trace.some((row) => row[0] === "permit"),
        false,
        mode,
      );
    if (mode === "reported-error")
      assert.equal(actual.error?.includes("secret"), false);
  }
});
test("navigation completion predicate preserves same-document and frame/load sequence semantics", () => {
  const original = originalServiceBindings([
    "Nte",
    "XN",
    "Fte",
    "Lte",
    "Ute",
    "qte",
    "Hh",
    "Iv",
  ]);
  for (const mainFrameId of [undefined, "root"]) {
    const config = {
      mainFrameId,
      previousUrl: "https://old.test/",
      targetUrl: "https://dest.test/",
    };
    const a = navigationCompletionPredicate(config),
      b = original.Nte(config);
    for (const [method, params] of [
      ["Page.loadEventFired", {}],
      [
        "Page.frameNavigated",
        { frame: { id: "child", parentId: "root", url: "https://dest.test/" } },
      ],
      ["Page.loadEventFired", {}],
      ["Page.navigatedWithinDocument", { url: "https://old.test/#hash" }],
      [
        "Page.frameNavigated",
        { frame: { id: "root", url: "https://dest.test/" } },
      ],
      ["Page.domContentEventFired", {}],
    ] as const) {
      const e = { method, params, source: { tabId: 7 } };
      assert.equal(a(e), b(e));
    }
  }
});
