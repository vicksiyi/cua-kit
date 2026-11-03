import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import {
  focusedFrameExpression,
  resolveClipboardFocus,
} from "../packages/browser/src/service/clipboard/focused_frame";
const original = originalServiceBindings(["q5", "j5"]);
async function outcome(fn: () => Promise<unknown>) {
  try {
    return { value: await fn() };
  } catch (e: any) {
    return { error: e.message };
  }
}
test("clipboard focused-frame expression matches the embedded source exactly", () =>
  assert.equal(focusedFrameExpression, original.q5));
test("clipboard focus traversal preserves identity, target switching, cleanup and cycle errors", async () => {
  for (const mode of [
    "none",
    "no-frame",
    "remote",
    "isolated",
    "nested",
    "cycle",
    "evaluate-error",
    "describe-error",
    "release-error",
  ]) {
    async function run(fn: typeof resolveClipboardFocus) {
      const trace: any[] = [];
      let evaluated = 0;
      const initial = { target: { tabId: 1 }, inputTargetToken: "token" };
      const context = {
        cdp: {
          async callTarget(target: any, method: string, params: any) {
            trace.push([target, method, params]);
            if (method === "Runtime.evaluate") {
              evaluated++;
              if (mode === "evaluate-error")
                return { exceptionDetails: { text: "bad" } };
              return {
                result:
                  mode === "none" ||
                  (evaluated > 1 && mode !== "nested" && mode !== "cycle") ||
                  (mode === "nested" && evaluated > 2)
                    ? {}
                    : { objectId: "frame-object" },
              };
            }
            if (method === "DOM.describeNode") {
              if (mode === "describe-error") throw Error("describe failed");
              return {
                node:
                  mode === "no-frame"
                    ? {}
                    : { frameId: `frame-${mode === "cycle" ? 1 : evaluated}` },
              };
            }
            if (method === "Runtime.releaseObject") {
              if (mode === "release-error") throw Error("release failed");
              return {};
            }
            return { executionContextId: 8 };
          },
          async targetForFrameOrAttach(tab: number, frame: string) {
            trace.push(["attach", tab, frame]);
            if (mode === "isolated") return undefined;
            return { tabId: 1, sessionId: mode === "cycle" ? "cycle" : frame };
          },
        },
      };
      const result = await outcome(() => fn(context, 1, initial));
      return { result, trace, same: result.value === initial };
    }
    assert.deepEqual(
      await run(resolveClipboardFocus),
      await run(original.j5),
      mode,
    );
  }
});
