import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings, serviceSourceSha256 } from "./service-source";
import {
  TabAXActionCommand,
  TabAXGetStateCommand,
} from "../packages/browser/src/service/commands/accessibility";
import { inputTimeout } from "../packages/browser/src/service/input/input";
import { defineCommand } from "../packages/browser/src/service/commands/define_command";
import { positiveTabId } from "../packages/browser/src/service/tab_id";
import { captureTabScreenshot } from "../packages/browser/src/service/commands/screenshot";
import { AccessibilityActionError } from "../packages/browser/src/service/accessibility/dialog_actions";
import { StaleAccessibilityCaptureError } from "../packages/browser/src/service/accessibility/state_store";
assert.equal(
  serviceSourceSha256,
  "396d4bcd890e8e41e336469eb1a050bafd36bb2d91152b75bb22b70b56622021",
);
const original = originalServiceBindings(["nF", "pF", "Co", "Dc", "Mc"], {
  O: defineCommand,
  H: positiveTabId,
  Wi: captureTabScreenshot,
  Ro: AccessibilityActionError,
  Bo: StaleAccessibilityCaptureError,
  Oe: inputTimeout,
});
function fixture(scenario: string) {
  const trace: any[] = [];
  let captures = 0,
    checks = 0,
    session = "session";
  const ctx: any = {
    supportsTabCapability: async () => scenario.startsWith("siwc"),
    playwright: {
      evaluateOnPlaywrightPage: async (_tab: any, fn: any) => {
        if (scenario === "siwc-unavailable") throw Error("page unavailable");
        return fn({
          siwcDocumentId: () => "generation",
          siwcDetect: () => [
            {
              ref: "s1",
              evidence: "siwc_marker_detected",
              visibility: "rendered",
            },
          ],
        });
      },
    },
    acquireAuthority: () => {
      trace.push("authority");
      const authorize = (kind: string, url: string) => {
        trace.push([kind, url]);
        return {
          assert: async () => {
            checks++;
            trace.push(["assert", checks]);
            if (
              (scenario === "deny" && checks === 1) ||
              (scenario === "deny-after" && checks === 2) ||
              (scenario === "siwc-deny-after" && checks === 3)
            )
              throw Error("denied");
            if (scenario === "session-after-check" && checks === 2)
              session = "other";
          },
        };
      };
      return {
        actInFrame: (url: string) => authorize("act", url),
        observeContent: (url: string) => authorize("observe", url),
      };
    },
    security: {
      currentTabUrl: async (id: number) => {
        trace.push(["url", id]);
        return `url:${captures}`;
      },
    },
    followSessionTab: async (id: number) => {
      trace.push(["follow", id]);
      if (scenario === "follow-error") throw Error("follow failed");
    },
    getCurrentSessionId: () => {
      trace.push(["session", session]);
      return session;
    },
    cdp: {
      call: async (id: number, method: string, params: any, options: any) => {
        trace.push(["cdp", id, method, params, options]);
        if (method === "Runtime.evaluate") return { result: { value: 0.5 } };
        if (method === "Page.getLayoutMetrics")
          return {
            cssVisualViewport: {
              pageX: 0,
              pageY: 0,
              clientWidth: 100,
              clientHeight: 80,
            },
          };
        return { data: "image" };
      },
    },
    ax: {
      discardCapture: (id: number, capture: any) =>
        trace.push(["discard", id, capture]),
      performAction: async (id: number, action: any) => {
        trace.push(["perform", id, action]);
        if (scenario === "action-error")
          throw new AccessibilityActionError("action failed");
        if (scenario === "generic-error") throw Error("generic");
      },
      capture: async (
        id: number,
        content: string,
        options: any,
        screenshot: any,
      ) => {
        captures++;
        trace.push(["capture", id, content, options]);
        if (
          scenario === "stale-always" ||
          (scenario === "stale-once" && captures === 1) ||
          (scenario === "session-changed" && captures === 1) ||
          (scenario === "session-after-check" && captures === 1)
        ) {
          if (scenario === "session-changed") session = "other";
          throw new StaleAccessibilityCaptureError();
        }
        if (scenario === "capture-error") throw Error("capture failed");
        if (scenario === "screenshot") return await screenshot();
        return {
          state: "current state",
          ...(scenario === "unavailable"
            ? { screenshot_unavailable: "blocked screenshot" }
            : {}),
        };
      },
      validateCapture: (id: number, capture: any) => {
        trace.push(["validate", id, capture]);
        if (scenario === "validation-stale" && captures === 1)
          throw new StaleAccessibilityCaptureError();
        if (scenario === "validation-error") throw Error("invalid");
      },
    },
  };
  return { trace, ctx };
}
async function run(command: any, scenario: string, payload: any) {
  const { trace, ctx } = fixture(scenario);
  let result, error;
  try {
    result = await command(payload, ctx);
  } catch (e: any) {
    error = { message: e.message, cause: e.cause?.message };
  }
  return { trace, result, error };
}
test("AX get-state command preserves authority order, one retry, session boundaries and screenshot callback", async () => {
  assert.equal(TabAXGetStateCommand.type, original.pF.type);
  for (const scenario of [
    "siwc",
    "siwc-unavailable",
    "siwc-deny-after",
    "normal",
    "deny",
    "deny-after",
    "stale-once",
    "stale-always",
    "session-changed",
    "session-after-check",
    "capture-error",
    "validation-stale",
    "validation-error",
    "screenshot",
    "unavailable",
  ]) {
    const payload = {
      tab_id: "1",
      content:
        scenario === "screenshot" || scenario === "unavailable"
          ? "screenshot"
          : "axState",
    };
    assert.deepEqual(
      await run(TabAXGetStateCommand, scenario, payload),
      await run(original.pF, scenario, payload),
      scenario,
    );
  }
  for (const tab_id of [0, "invalid"])
    assert.deepEqual(
      await run(TabAXGetStateCommand, "normal", { tab_id, content: "axState" }),
      await run(original.pF, "normal", { tab_id, content: "axState" }),
    );
});
test("AX action command enriches only action errors after an authorized validated capture", async () => {
  assert.equal(TabAXActionCommand.type, original.nF.type);
  for (const scenario of [
    "normal",
    "deny",
    "follow-error",
    "action-error",
    "generic-error",
  ]) {
    const payload = { tab_id: "1", action: { kind: "click", target: 7 } };
    const actual = await run(TabAXActionCommand, scenario, payload);
    assert.deepEqual(
      actual,
      await run(original.nF, scenario, payload),
      scenario,
    );
    if (scenario === "action-error")
      assert.deepEqual(actual.error, {
        message: "action failed\n\ncurrent state",
        cause: "action failed",
      });
  }
});
