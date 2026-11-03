import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { createAuthSafetyReview } from "../packages/browser/src/service/browser_auth/safety_review";
import {
  approvalRuntime,
  browserDisplayName,
} from "../packages/browser/src/service/security/approval";
async function run(source: boolean, mode: string) {
  const trace: any[] = [];
  const context: any = {
    clientInfo: { type: "fixture" },
    elicitationDisplayName: "Fixture Browser",
    filesystem: { id: "fs" },
    environment: "test",
  };
  const checkpoint = {
    async revalidateForReview() {
      trace.push("review-check");
      return mode === "prompt-change"
        ? "prompt_changed"
        : mode === "page-change"
          ? "page_changed"
          : null;
    },
    async revalidate() {
      trace.push("final-check");
      return mode === "final-change"
        ? "prompt_changed"
        : mode === "final-origin"
          ? "origin_changed"
          : null;
    },
  };
  const readDocumentation = async (...args: any[]) => {
    trace.push(["docs", ...args]);
    if (mode === "docs-error") throw new Error("docs failure");
    return mode === "empty-docs" ? "  " : "  instructions  ";
  };
  const captureVisibleDom: any = async (
    locator: any,
    _ctx: any,
    frame: string,
    frames: Set<string>,
  ) => {
    trace.push(["snapshot", locator, frame]);
    if (mode === "capture-error") throw new Error("capture failure");
    if (mode !== "missing-frame") frames.add(frame);
    return mode === "empty-snapshot" ? "  " : "page snapshot";
  };
  const original = originalServiceBindings(["ID", "EY", "$_", "TY", "_a"], {
    wf: readDocumentation,
    xD: captureVisibleDom,
    nt: browserDisplayName,
    ho: approvalRuntime.failCheck,
    vY: "review_browser_auth_safety",
  });
  const args: any = {
    actionTargets: {
      options: [
        {
          id: "choice",
          accessible_name: "Choice",
          origin: "https://frame.test",
          selector: "excluded",
        },
      ],
      submit: {
        action: "click",
        accessible_name: "Submit",
        origin: "excluded",
        selector: "excluded",
      },
      submissionOrigin: "https://frame.test",
    },
    captureScreenshotAndValidateLocators: async () => {
      trace.push("screenshot");
      if (mode === "screenshot-error" || mode === "both-error")
        throw new Error("screenshot failure");
      return mode === "locator-invalid" ? "locator_invalid" : null;
    },
    checkpoint,
    credentialFieldMetadata: [{ id: "user" }],
    credentialFrameId: "frame",
    credentialFrameOrigin: "https://frame.test",
    createAutomatedSafetyPrecheck: (payload: any) => {
      trace.push(["precheck", payload]);
      if (mode === "sync-error") throw new Error("synchronous failure");
      return mode === "review-error" || mode === "both-error"
        ? Promise.reject(new Error("review failure"))
        : Promise.resolve({ ignored: "result" });
    },
    ctx: context,
    params: { browser_id: "fixture", tab_id: "7", timeout_ms: 123 },
    proposedUserPrompt: { origin: "https://top.test", fields: [] },
  };
  approvalRuntime.setAuditSink((record) => {
    trace.push(["audit", record]);
  });
  let result: any;
  try {
    result = await (
      source
        ? original.ID
        : createAuthSafetyReview({ readDocumentation, captureVisibleDom })
            .reviewAuthSafety
    )(args);
  } catch (error) {
    const e = error as any;
    result = {
      error: e.message,
      name: e.name,
      reason: e.reason,
      cause: e.cause?.message,
    };
  } finally {
    approvalRuntime.setAuditSink(undefined);
  }
  return JSON.parse(JSON.stringify({ result, trace }));
}
test("auth safety review matches original snapshot, prompt projection, audit and error precedence", async () => {
  for (const mode of [
    "normal",
    "docs-error",
    "empty-docs",
    "capture-error",
    "missing-frame",
    "empty-snapshot",
    "prompt-change",
    "page-change",
    "final-change",
    "final-origin",
    "screenshot-error",
    "both-error",
    "locator-invalid",
    "sync-error",
    "review-error",
  ])
    assert.deepEqual(await run(false, mode), await run(true, mode), mode);
  const normal = await run(false, "normal");
  assert.equal(normal.result, null);
  assert.equal(normal.trace.at(-1), "final-check");
  assert.equal((await run(false, "both-error")).result.error, "review failure");
  assert.equal((await run(false, "page-change")).result, "page_changed");
  assert.ok(!(await run(false, "sync-error")).trace.includes("screenshot"));
});
test("auth safety waits for both precheck and screenshot before propagating rejection", async () => {
  let release!: () => void;
  let screenshotStarted = false;
  let settled = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const review = createAuthSafetyReview({
    readDocumentation: async () => "instructions",
    captureVisibleDom: async (_params, _ctx, frame, frames) => {
      frames!.add(frame!);
      return "snapshot";
    },
  }).reviewAuthSafety({
    actionTargets: { options: [], submissionOrigin: null },
    captureScreenshotAndValidateLocators: async () => {
      screenshotStarted = true;
      await pending;
      return null;
    },
    checkpoint: {
      async revalidateForReview() {
        return null;
      },
      async revalidate() {
        return null;
      },
    },
    credentialFieldMetadata: [],
    credentialFrameId: "frame",
    credentialFrameOrigin: "https://fixture.test",
    createAutomatedSafetyPrecheck: () =>
      Promise.reject(new Error("review rejected")),
    ctx: { clientInfo: { type: "fixture" } },
    params: { tab_id: "7" },
    proposedUserPrompt: { origin: "https://fixture.test" },
  });
  const observed = review.catch((error) => {
    settled = true;
    return error.message;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(screenshotStarted, true);
  assert.equal(settled, false);
  release();
  assert.equal(await observed, "review rejected");
});
