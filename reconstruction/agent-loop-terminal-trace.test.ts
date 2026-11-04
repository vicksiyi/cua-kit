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
