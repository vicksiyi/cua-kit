import test from "node:test";
import assert from "node:assert/strict";
import { createAutoApproval, demoApprovalArguments } from "../packages/agent-loop/src/auto-approval";
const request = (connector: string): any => ({ mode: "form", message: "Approve owned fixture", requestedSchema: { type: "object", properties: {} }, _meta: { connector_id: connector, tool_name: "fixture", codex_request_type: "approval_request" } });
test("opt-in accepts browser, app and other empty consent forms without terminal input", async () => {
 const approved: string[] = [];
 const handler = createAutoApproval({ enabled: true, onApproved: p => approved.push(String(p._meta?.connector_id)), fallback: async () => { throw Error("No terminal access expected"); } })!;
 for (const name of ["browser-use", "computer-use", "other-service"]) assert.deepEqual(await handler(request(name)), { action: "accept", content: {} });
 assert.deepEqual(approved, ["browser-use", "computer-use", "other-service"]);
});
test("disabled mode preserves manual decisions and absent capability", async () => {
 const fallback = async () => ({ action: "decline" as const });
 assert.equal(createAutoApproval({ enabled: false, fallback }), fallback);
 assert.equal(createAutoApproval({ enabled: false }), undefined);
});
test("user-input forms and URL authentication keep existing handling", async () => {
 let calls = 0;
 const handler = createAutoApproval({ enabled: true, fallback: async () => { calls++; return { action: "cancel" }; } })!;
 const form = request("computer-use"); form.requestedSchema.properties = { account: { type: "string" } };
 assert.equal((await handler(form)).action, "cancel");
 assert.equal((await handler({ mode: "url", message: "Authenticate", url: "https://example.test", elicitationId: "x" })).action, "cancel");
 assert.equal(calls, 2);
});
test("cancellation never approves or invokes fallback", async () => {
 const controller = new AbortController(); controller.abort();
 const handler = createAutoApproval({ enabled: true, signal: controller.signal, fallback: async () => { throw Error("Must not run"); } })!;
 assert.equal((await handler(request("computer-use"))).action, "cancel");
});
test("argument flag is removed but prompt text and delimiter remain literal", () => {
 assert.deepEqual(demoApprovalArguments(["--auto-approve", "打开应用"]), { autoApprove: true, args: ["打开应用"] });
 assert.deepEqual(demoApprovalArguments(["--", "--auto-approve"]), { autoApprove: false, args: ["--auto-approve"] });
 assert.deepEqual(demoApprovalArguments(["prompt", "--auto-approve"]), { autoApprove: false, args: ["prompt", "--auto-approve"] });
 assert.deepEqual(demoApprovalArguments(["--auto-approve", "--check-computer"]), { autoApprove: true, args: ["--check-computer"] });
});
