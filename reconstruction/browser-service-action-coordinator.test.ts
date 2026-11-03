import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { originalServiceBindings } from "./service-source";
import {
  createAccessibilityActions,
  raceJavaScriptDialog,
} from "../packages/browser/src/service/accessibility/action_coordinator";
const original = originalServiceBindings(["nu"]);
class Cdp extends EventEmitter {
  dialog: any;
  getJsDialog(_id: number) {
    return this.dialog;
  }
  activeJsDialog(_id: number, id: string) {
    if (id !== this.dialog?.id) throw Error("stale");
    return this.dialog;
  }
  open(type = "alert", tabId = 1, message = "hello") {
    this.dialog = { id: "dialog", type, message };
    this.emit("event", {
      method: "Page.javascriptDialogOpening",
      source: { tabId },
      params: { type },
    });
  }
}
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}

test("dialog race matches source for existing/new/ignored dialogs, operation failures and listener cleanup", async () => {
  for (const mode of [
    "normal",
    "failure",
    "existing",
    "beforeunload",
    "new",
    "wrong-tab",
    "throw-handler",
    "failure-dialog",
  ]) {
    async function run(fn: typeof raceJavaScriptDialog) {
      const cdp = new Cdp(),
        trace: unknown[] = [];
      if (mode === "existing" || mode === "beforeunload")
        cdp.open(mode === "existing" ? "prompt" : "beforeunload");
      const result = await outcome(() =>
        fn(
          cdp,
          1,
          async () => {
            trace.push("operation");
            if (["new", "throw-handler", "failure-dialog"].includes(mode))
              cdp.open();
            if (mode === "wrong-tab") cdp.open("alert", 2);
            if (mode === "failure" || mode === "failure-dialog")
              throw Error("operation failed");
            return "done";
          },
          (dialog) => {
            trace.push(["dialog", dialog.type]);
            if (mode === "throw-handler") throw Error("dialog failed");
            return "interrupted";
          },
        ),
      );
      return { result, trace, listeners: cdp.listenerCount("event") };
    }
    assert.deepEqual(
      await run(raceJavaScriptDialog),
      await run(original.nu),
      mode,
    );
  }
});

test("AX coordinator serializes tracked input per tab and preserves error/dialog abort behavior", async () => {
  for (const mode of [
    "normal",
    "failure",
    "interrupt",
    "existing",
    "other-tab",
    "untracked",
  ]) {
    async function run(source: boolean) {
      const cdp = new Cdp(),
        trace: unknown[] = [];
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started!: () => void;
      const firstStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const page = async (
        _context: any,
        tab: number,
        action: any,
        signal: AbortSignal,
      ) => {
        trace.push(["start", tab, action.tag]);
        if (action.tag === 1) {
          started();
          await blocked;
        }
        trace.push([
          "end",
          tab,
          action.tag,
          signal.aborted,
          signal.reason?.message,
        ]);
        if (mode === "failure" && action.tag === 1) throw Error("failed");
      };
      const dialog = async (
        _context: any,
        tab: number,
        action: any,
        id: string,
      ) => {
        trace.push(["dialog", tab, action.tag, id]);
      };
      const Actions = source
        ? originalServiceBindings(["Gh"], {
            nu: original.nu,
            Tre: page,
            Cre: dialog,
          }).Gh
        : createAccessibilityActions(page, dialog);
      const actions = new Actions({ cdp });
      if (mode === "existing") {
        cdp.open("beforeunload");
        await actions.perform(1, { kind: "click", tag: 1 });
        return {
          trace,
          size: actions.pendingInput.size,
          listeners: cdp.listenerCount("event"),
        };
      }
      const first = outcome(() =>
        actions.perform(1, {
          kind: mode === "untracked" ? "scroll" : "click",
          tag: 1,
        }),
      );
      await firstStarted;
      const second = outcome(() =>
        actions.perform(mode === "other-tab" ? 2 : 1, {
          kind: "type_text",
          tag: 2,
        }),
      );
      if (mode === "interrupt") cdp.open();
      await Promise.resolve();
      release();
      const results = await Promise.all([first, second]);
      await blocked;
      await new Promise<void>((resolve) => setImmediate(resolve));
      return {
        trace,
        results,
        size: actions.pendingInput.size,
        listeners: cdp.listenerCount("event"),
      };
    }
    assert.deepEqual(await run(false), await run(true), mode);
  }
});
