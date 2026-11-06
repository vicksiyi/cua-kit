import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { createTerminalTrace } from "../packages/agent-loop/src/terminal-trace";
test("terminal tool trace shows requests/results, redacts known credentials and saves returned images", () => {
  const lines: string[] = [];
  const trace = createTerminalTrace({ DEEPSEEK_API_KEY: "fixture-private-key", CUA_DEMO_VERBOSE: "1" }, text => lines.push(text));
  trace({ role: "assistant", toolCalls: [{ id: "1", name: "js", arguments: { code: "fixture-private-key\u001b[31m" } }] });
  trace({ role: "tool", callId: "1", name: "js", result: { content: [{ type: "text", text: "42 fixture-private-key\u001b[31m" }, { type: "image", mimeType: "image/png", data: Buffer.from("fixture-bytes").toString("base64") }] } });
  assert.match(lines.join("\n"), /TOOL REQUEST js/);
  assert.match(lines.join("\n"), /TOOL RESULT js.*OK/);
  assert.match(lines.join("\n"), /42 \[REDACTED\]/);
  assert.ok(!lines.join("\n").includes("fixture-private-key"));
  assert.ok(!lines.join("\n").includes("\u001b"));
  const file = lines.find(line => line.startsWith("Screenshot: "))!.slice("Screenshot: ".length);
  try { assert.equal(readFileSync(file, "utf8"), "fixture-bytes"); }
  finally { rmSync(dirname(file), { recursive: true }); }
});

test("local policy explanation is limited to standalone error output and preserves original result", () => {
  const text = "Computer Use is blocked from using the app 'ai.multica.desktop' by your organization's policy.";
  for (const standalone of [false, true]) for (const isError of [false, true]) {
    const lines: string[] = [];
    const trace = createTerminalTrace(standalone ? { CUA_DEMO_NATIVE_POLICY_CONTEXT: "local rules" } : {}, line => lines.push(line));
    const message = { role: "tool" as const, callId: "denied", name: "js", result: { isError, content: [{ type: "text" as const, text }] } };
    const before = JSON.stringify(message);
    trace(message);
    assert.equal(lines.some(line => line.includes("本独立 demo 使用本地 CORE_CUA_APP_POLICY")), standalone && isError);
    assert.ok(lines.includes(text));
    assert.equal(JSON.stringify(message), before);
  }
});

test("app-server denial is not mislabeled as standalone allow-list denial", () => {
  const text = "Computer Use is blocked from using the app 'test.fixture' by your organization's policy.";
  const lines: string[] = [];
  const trace = createTerminalTrace({CUA_DEMO_NATIVE_POLICY_CONTEXT:"app-server provider",CUA_DEMO_NATIVE_POLICY_SOURCE:"app-server"},line=>lines.push(line));
  trace({role:"tool",callId:"provider-denied",name:"js",result:{isError:true,content:[{type:"text",text}]}});
  assert.ok(lines.includes(text));
  assert.equal(lines.some(line=>line.includes('CORE_CUA_APP_POLICY')),false);
});
