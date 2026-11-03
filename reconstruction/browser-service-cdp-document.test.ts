import test from "node:test";
import assert from "node:assert/strict";
import {
  serviceClassMethod,
  originalServiceBindings,
} from "./service-source.ts";
import { documentMethods } from "../packages/browser/dist/service/cdp/document_methods.js";
import { closeMethods } from "../packages/browser/dist/service/cdp/close_methods.js";
const bindings = originalServiceBindings(["Ste", "Uh"]);
const original = new Function(
  ...Object.keys(bindings),
  "return {" +
    [...Object.keys(documentMethods), ...Object.keys(closeMethods)]
      .map((n) => serviceClassMethod("qh", n))
      .join(",") +
    "}",
)(...Object.values(bindings));
const rebuilt = { ...documentMethods, ...closeMethods };
async function outcome(fn: () => any) {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("document evaluation preserves option projection and exception message precedence", async () => {
  async function run(methods: any) {
    const results = [];
    for (const details of [
      null,
      {},
      { text: "fallback" },
      { exception: { value: "", description: "description" }, text: "text" },
      { exception: { value: 2, description: "description" } },
    ]) {
      const trace: any[] = [];
      const o = {
        ...methods,
        async call(...args: any[]) {
          trace.push(args);
          return { exceptionDetails: details, result: { value: 7 } };
        },
      };
      for (const opts of [
        {},
        {
          returnByValue: false,
          awaitPromise: false,
          timeoutMs: 8,
          deadlineMs: 0,
        },
      ])
        results.push({
          outcome: await outcome(() => o.evaluateJavascript("1", "expr", opts)),
          trace: [...trace],
        });
    }
    return results;
  }
  assert.deepEqual(await run(rebuilt), await run(original));
});
test("document state caches only nonempty finite-tab href while committed URL passes numeric conversion through", async () => {
  async function run(methods: any) {
    const trace: any[] = [];
    let value: any = { href: "url" };
    const o: any = {
      ...methods,
      topLevelUrlsByTabId: new Map(),
      async evaluateJavascript(...args: any[]) {
        trace.push(args);
        if (value === "throw") throw Error("provider");
        return value;
      },
      api: {
        async getCommittedTabUrl(id: number) {
          trace.push(["committed", id]);
          return "";
        },
      },
    };
    const results = [];
    for (const next of [
      { href: "url" },
      { href: "" },
      { href: 3 },
      null,
      "throw",
    ]) {
      value = next;
      results.push(await o.readDocumentState("1", { includePaint: true }));
    }
    results.push(
      await o.readCommittedTabUrl("invalid"),
      o.currentTopLevelUrl("invalid"),
      o.currentTopLevelUrl(1),
    );
    return { results, trace, urls: o.topLevelUrlsByTabId };
  }
  assert.deepEqual(await run(rebuilt), await run(original));
});
test("closeTab preserves target selection, cleanup order and finally boundary", async () => {
  async function run(methods: any, mode: string) {
    const trace: any[] = [];
    const o: any = {
      ...methods,
      async call(...args: any[]) {
        trace.push(["call", ...args]);
        if (mode === "query") throw Error("query");
        return {
          targetInfos:
            mode === "fallback"
              ? []
              : [
                  { tabId: "1", targetId: "wrong" },
                  { tabId: 1, id: "target" },
                ],
        };
      },
      async waitForTabAttachment(id: number) {
        trace.push(["wait", id]);
        if (mode === "wait") throw Error("wait");
      },
      async runTabCleanupHandlers(id: number) {
        trace.push(["cleanup", id]);
        if (mode === "cleanup") throw Error("cleanup");
      },
      forgetAttachedTab(id: number) {
        trace.push(["forget", id]);
      },
      api: {
        async executeCdp(payload: any) {
          trace.push(payload);
          if (mode === "provider") throw Error("provider");
        },
      },
    };
    return { outcome: await outcome(() => o.closeTab("1")), trace };
  }
  for (const mode of [
    "normal",
    "fallback",
    "query",
    "wait",
    "cleanup",
    "provider",
  ])
    assert.deepEqual(await run(rebuilt, mode), await run(original, mode));
});
test("detachAllTabs snapshots pending keys and settles partial failure; chooser removal uses strict tab identity", async () => {
  async function run(methods: any) {
    const trace: any[] = [];
    const o: any = {
      ...methods,
      tabAttachmentPromises: new Map([
        [1, Promise.resolve()],
        [2, Promise.resolve()],
      ]),
      fileChoosersById: new Map([
        ["a", { tabId: 1 }],
        ["b", { tabId: "1" }],
        ["c", { tabId: 2 }],
      ]),
      async detachTab(id: number, reason: string) {
        trace.push([id, reason]);
        this.tabAttachmentPromises.set(3, Promise.resolve());
        if (id === 1) throw Error("failed");
      },
    };
    await o.detachAllTabs("turnEnded");
    o.deleteFileChoosersForTab(1);
    return { trace, choosers: o.fileChoosersById };
  }
  assert.deepEqual(await run(rebuilt), await run(original));
});
