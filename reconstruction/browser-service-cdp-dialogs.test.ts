import test from "node:test";
import assert from "node:assert/strict";
import {
  serviceClassMethod,
  serviceClassWithMethods,
  serviceSourceSha256,
  originalServiceBindings,
} from "./service-source.ts";
import { dialogMethods } from "../packages/browser/src/service/cdp/dialog_methods";
import { lifecycleMethods } from "../packages/browser/src/service/cdp/lifecycle_methods";
// Minified helper names below were inspected in this exact artifact.
assert.equal(serviceSourceSha256, "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
  "Re-audit helper bindings for changed browser-service artifact");
const bindings = originalServiceBindings(["Pte", "Ite"]);
const names = [
  ...Object.keys(dialogMethods),
  "attachedTabIdForCdpEvent",
  "deleteFrameSession",
];
const sourceClass = serviceClassWithMethods(names);
const original = new Function(
  ...Object.keys(bindings),
  "return {" + names.map((n) => serviceClassMethod(sourceClass, n)).join(",") + "}",
)(...Object.values(bindings));
const rebuilt = { ...lifecycleMethods, ...dialogMethods };
function owner(methods: any, protectedTab = false) {
  const o: any = {
    ...methods,
    jsDialogSequence: 0,
    jsDialogsByTabId: new Map(),
    attachedTabIds: new Set([1, 2]),
    frameSessionsBySessionId: new Map(),
    frameSessionsByTabId: new Map(),
    trace: [],
  };
  o.hasBrowserAuthRawEventProtection = () => protectedTab;
  o.callTarget = async (...args: any[]) => {
    o.trace.push(args);
    throw Error("provider failure");
  };
  return o;
}
function event(type: string, source: any = { tabId: 1 }, extra: any = {}) {
  return {
    method: "Page.javascriptDialogOpening",
    source,
    params: { type, ...extra },
  };
}
function outcome(run: () => any) {
  try {
    return { value: run() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
test("dialog events retain defaults, ids, target matching and frame detach cleanup", async () => {
  async function run(methods: any) {
    const o = owner(methods),
      session = {
        sessionId: "s",
        targetId: "t",
        frameId: "f",
        target: { tabId: 1, sessionId: "s" },
      };
    o.frameSessionsBySessionId.set("s", session);
    o.frameSessionsByTabId.set(
      1,
      new Map([
        ["t", session],
        ["f", session],
      ]),
    );
    o.handleJavaScriptDialogEvent(event("unknown"));
    o.handleJavaScriptDialogEvent(
      event(
        "prompt",
        { sessionId: "s" },
        { message: "hello", defaultPrompt: "text", url: "page" },
      ),
    );
    const first = { ...o.activeJsDialog(1, "1"), public: o.getJsDialog("1") };
    o.handleJavaScriptDialogEvent({
      method: "Page.javascriptDialogClosed",
      source: { tabId: 1 },
      params: {},
    });
    const retained = o.jsDialogsByTabId.has(1);
    o.deleteFrameSession(session);
    const removed = !o.jsDialogsByTabId.has(1);
    o.handleJavaScriptDialogEvent(event("beforeunload"));
    await Promise.resolve();
    return {
      first,
      retained,
      removed,
      dialogs: o.jsDialogsByTabId,
      sequence: o.jsDialogSequence,
      trace: o.trace,
    };
  }
  assert.deepEqual(await run(rebuilt), await run(original));
});
test("protected dialogs auto-handle alerts only and do not replace stored dialogs", async () => {
  async function run(methods: any) {
    const o = owner(methods, true);
    o.jsDialogsByTabId.set(1, { id: "old", type: "prompt" });
    for (const type of [
      "alert",
      "confirm",
      "prompt",
      "beforeunload",
      "unknown",
    ])
      o.handleJavaScriptDialogEvent(event(type, { tabId: 1, sessionId: "s" }));
    o.handleJavaScriptDialogEvent(event("alert", { tabId: 99 }));
    await Promise.resolve();
    return {
      trace: o.trace,
      dialogs: o.jsDialogsByTabId,
      sequence: o.jsDialogSequence,
    };
  }
  assert.deepEqual(await run(rebuilt), await run(original));
});
test("dialog lookup, prompt mutation and CDP guard preserve original error ordering", () => {
  function run(methods: any) {
    const o = owner(methods),
      results = [];
    o.rememberJsDialog(event("prompt"));
    results.push(outcome(() => o.updateJsDialogPrompt(1, "1", "updated")));
    results.push({ ...o.activeJsDialog(1, "1") });
    for (const input of ["bad", Infinity, 1, "1", null])
      for (const id of ["", "stale", "1"]) {
        results.push(outcome(() => o.activeJsDialog(input, id)));
      }
    results.push(
      outcome(() => o.throwIfJsDialogBlocksMethod(1, "Page.enable")),
    );
    results.push(
      outcome(() =>
        o.throwIfJsDialogBlocksMethod(1, "Page.handleJavaScriptDialog"),
      ),
    );
    o.deleteJsDialog(1, "stale");
    results.push(o.getJsDialog(1));
    o.deleteJsDialog(1, "1");
    results.push(o.getJsDialog(1));
    o.rememberJsDialog(event("confirm"));
    results.push(outcome(() => o.updateJsDialogPrompt(1, "2", "bad")));
    results.push(outcome(() => o.deleteJsDialog("invalid", "")));
    results.push(outcome(() => o.getJsDialog("invalid")));
    return results;
  }
  assert.deepEqual(run(rebuilt), run(original));
});
