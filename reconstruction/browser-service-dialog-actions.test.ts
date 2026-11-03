import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  performDialogAction,
  handleJavaScriptDialog,
  closeJavaScriptDialog,
  isDialogClosed,
  AccessibilityActionError,
} from "../packages/browser/src/service/accessibility/dialog_actions";
const original = originalServiceBindings([
  "W",
  "dre",
  "cre",
  "lre",
  "F2",
  "Mv",
  "Do",
  "Cre",
]);
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return {
      error: e.message,
      cause: e.cause?.message,
      actionError:
        e instanceof AccessibilityActionError || e instanceof original.Do,
    };
  }
}
function setup(type: string, mode = "normal") {
  const trace: any[] = [];
  const dialog = {
    id: "d",
    type,
    promptText: "old",
    message: "message",
    url: "https://example.test",
    target: { tabId: 1, sessionId: "s" },
  };
  const context: any = {
    browserId: "browser",
    ax: {
      targetForElement(tab: number, id: number) {
        trace.push(["target", tab, id]);
        if (mode === "target-error") throw Error("stale element");
        return {
          javaScriptDialog:
            mode === "page-target"
              ? undefined
              : {
                  dialogID: mode === "stale" ? "old" : "d",
                  control:
                    id === 1 ? "accept" : id === 2 ? "dismiss" : "prompt",
                },
        };
      },
    },
    cdp: {
      activeJsDialog(tab: number, id: string) {
        trace.push(["active", tab, id]);
        return dialog;
      },
      updateJsDialogPrompt(...args: any[]) {
        trace.push(["update", ...args]);
      },
      async callTarget(...args: any[]) {
        trace.push(["dispatch", ...args]);
        if (mode === "dispatch-fails") throw Error("dispatch failed");
      },
      async waitForEvent(tab: number, predicate: Function, options: any) {
        trace.push([
          "wait",
          tab,
          options.timeoutMs,
          options.timeoutMessage,
          predicate({
            method: "Page.javascriptDialogClosed",
            source: { sessionId: "s" },
          }),
        ]);
        options.signal.addEventListener("abort", () => trace.push("abort"));
        if (mode === "wait-fails") throw Error("wait failed");
      },
      deleteJsDialog(...args: any[]) {
        trace.push(["delete", ...args]);
      },
    },
  };
  return { trace, context };
}
test("AX dialog actions match original validation, target errors, prompt edits and control mapping", async () => {
  const actions = [
    { kind: "click", target: 1 },
    { kind: "click", target: 2 },
    { kind: "click", target: [1, 2] },
    { kind: "click", target: 1, duration: 1 },
    { kind: "click", target: 1, key: "Shift" },
    { kind: "click", target: 1, mouse_button: "right" },
    { kind: "set_value", element_index: 3, value: "new" },
    { kind: "type_text", element_index: 3, text: "new" },
    { kind: "type_text", text: "new" },
    { kind: "press_key", key: "Enter" },
    { kind: "press_key", element_index: 2, key: "RETURN" },
    { kind: "press_key", key: "Escape" },
    { kind: "press_key", key: "a" },
    { kind: "paste", element_index: 3, text: "new" },
  ];
  for (const type of ["alert", "confirm", "prompt", "beforeunload"])
    for (const action of actions)
      for (const mode of ["normal", "target-error", "page-target", "stale"]) {
        async function run(fn: typeof performDialogAction) {
          const { trace, context } = setup(type, mode);
          return {
            result: await outcome(() => fn(context, 1, action, "d")),
            trace,
          };
        }
        assert.deepEqual(
          await run(performDialogAction),
          await run(original.Cre),
          JSON.stringify({ type, action, mode }),
        );
      }
});
test("dialog command preserves prompt requirements and close failure handling", async () => {
  for (const type of ["alert", "confirm", "prompt", "beforeunload"])
    for (const action of ["accept", "dismiss", "unknown"])
      for (const prompt_text of [undefined, "text"])
        for (const mode of ["normal", "dispatch-fails", "wait-fails"]) {
          async function run(fn: typeof handleJavaScriptDialog) {
            const { trace, context } = setup(type, mode);
            return {
              result: await outcome(() =>
                fn(
                  { tab_id: "1", dialog_id: "d", action, prompt_text },
                  context,
                ),
              ),
              trace,
            };
          }
          assert.deepEqual(
            await run(handleJavaScriptDialog),
            await run(original.Mv),
            JSON.stringify({ type, action, prompt_text, mode }),
          );
        }
  for (const target of [{ tabId: 1 }, { tabId: 1, sessionId: "s" }])
    for (const source of [
      { tabId: 1 },
      { tabId: 2 },
      { tabId: 1, sessionId: "s" },
      { tabId: 1, sessionId: "other" },
    ])
      for (const method of ["Page.javascriptDialogClosed", "other"])
        assert.equal(
          isDialogClosed({ source, method }, target),
          original.dre({ source, method }, target),
        );
});
test("close event can complete before dispatch settles; late rejection remains handled", async () => {
  async function run(fn: typeof closeJavaScriptDialog) {
    const { context, trace } = setup("prompt");
    let reject!: (error: Error) => void;
    context.cdp.callTarget = () =>
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      });
    const result = await outcome(() =>
      fn(context, 1, "d", { tabId: 1 }, { accept: true }),
    );
    reject(Error("late"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { result, trace };
  }
  assert.deepEqual(await run(closeJavaScriptDialog), await run(original.F2));
});

test("prompt editing and acceptance execute through real isolated Chromium CDP", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // Keep Playwright from auto-dismissing; this test handles the dialog through CDP.
    page.on("dialog", () => {});
    const session = await page.context().newCDPSession(page);
    await session.send("Page.enable");
    let current: any;
    const opened = new Promise<void>((resolve) =>
      session.once("Page.javascriptDialogOpening", (event) => {
        current = {
          id: "d",
          type: event.type,
          message: event.message,
          promptText: event.defaultPrompt ?? "",
          target: { tabId: 1 },
          url: event.url,
        };
        resolve();
      }),
    );
    const evaluated = session.send("Runtime.evaluate", {
      expression: 'prompt("Question", "old")',
      returnByValue: true,
    });
    await opened;
    const context: any = {
      browserId: "test",
      ax: {
        targetForElement: () => ({
          javaScriptDialog: { dialogID: "d", control: "prompt" },
        }),
      },
      cdp: {
        activeJsDialog: () => current,
        updateJsDialogPrompt: (_tab: number, _id: string, text: string) => {
          current.promptText = text;
        },
        callTarget: (_target: any, method: string, params: any) =>
          session.send(method as any, params),
        waitForEvent: (_tab: number, predicate: Function, options: any) =>
          new Promise<void>((resolve, reject) => {
            const closed = () => {
              if (
                predicate({
                  method: "Page.javascriptDialogClosed",
                  source: { tabId: 1 },
                })
              ) {
                cleanup();
                resolve();
              }
            };
            const abort = () => {
              cleanup();
              reject(options.signal.reason);
            };
            const timeout = setTimeout(() => {
              cleanup();
              reject(Error("test close timeout"));
            }, 5000);
            const cleanup = () => {
              clearTimeout(timeout);
              session.off("Page.javascriptDialogClosed", closed);
              options.signal.removeEventListener("abort", abort);
            };
            session.on("Page.javascriptDialogClosed", closed);
            options.signal.addEventListener("abort", abort, { once: true });
          }),
        deleteJsDialog: () => {
          current = undefined;
        },
      },
    };
    await performDialogAction(
      context,
      1,
      { kind: "type_text", text: "你好" },
      "d",
    );
    await performDialogAction(
      context,
      1,
      { kind: "press_key", key: "Enter" },
      "d",
    );
    assert.equal((await evaluated).result.value, "old你好");
    assert.equal(current, undefined);
  } finally {
    await browser.close();
  }
});
