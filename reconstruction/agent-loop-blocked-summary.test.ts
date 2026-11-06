import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { AgentLoop, ChatCompletionsModel } from "../packages/agent-loop/src/index";
import type { ToolClient, ModelAdapter } from "../packages/agent-loop/src/contracts";

const calls = ["observe", "denied", "skipped"].map(id => ({ id, name: "js", arguments: {} }));
function fixture() {
  const executed: string[] = [];
  const tools: ToolClient = {
    async listTools() { return [{ name: "js", description: "fixture", inputSchema: {} }]; },
    async callTool(call) {
      executed.push(call.id);
      if (call.id === "observe") return { content: [{ type: "text", text: "Observed company page: https://example.invalid/company" }] };
      if (call.id === "denied") return { isError: true, content: [{ type: "text", text: "Site safety rejected https://blocked.invalid" }], stopReason: { kind: "authorization", message: "任务未完成：安全检查拒绝访问。" } };
      throw new Error("Queued call must never execute");
    },
    async endTurn() { executed.push("end"); },
    async close() {},
  };
  return { tools, executed };
}

test("blocked report uses actual HTTP text-only completion with a closed batch and keeps blocked status", async () => {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    requests.push(JSON.parse(body));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: requests.length === 1
      ? { tool_calls: calls.map(call => ({ id: call.id, type: "function", function: { name: call.name, arguments: "{}" } })) }
      : { content: "Incomplete: company page was observed; blocked content was not read." } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const { tools, executed } = fixture();
  try {
    const result = await new AgentLoop(new ChatCompletionsModel({ endpoint: `http://127.0.0.1:${address.port}`, apiKey: "fixture", model: "fixture" }), tools)
      .run("Research", { summarizeOnBlocked: true });
    assert.equal(result.status, "blocked");
    assert.match(result.answer, /^任务未完成/);
    assert.match(result.answer, /company page was observed/);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].tools, undefined);
    assert.equal(requests[1].tool_choice, "none");
    const results = requests[1].messages.filter((message: any) => message.role === "tool");
    assert.deepEqual(results.map((message: any) => message.tool_call_id), calls.map(call => call.id));
    assert.match(results[0].content, /example.invalid\/company/);
    assert.match(results[2].content, /Not executed/);
    assert.deepEqual(executed, ["observe", "denied", "end"]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

for (const mode of ["calls", "empty", "failure", "abort", "misleading"] as const) {
  test(`blocked report ${mode} cannot resume actions or turn failure into completion`, async () => {
    const { tools, executed } = fixture();
    const controller = new AbortController();
    const failure = new Error("summary request failed");
    let decisions = 0;
    const model: ModelAdapter = { async decide(input) {
      if (++decisions === 1) return { toolCalls: calls };
      assert.deepEqual(input.tools, []);
      if (mode === "failure") throw failure;
      if (mode === "abort") { controller.abort(failure); return { text: "discard" }; }
      if (mode === "calls") return { text: "discard", toolCalls: [calls[2]] };
      if (mode === "misleading") return { text: "Task completed" };
      return {};
    } };
    const run = new AgentLoop(model, tools).run("Research", { summarizeOnBlocked: true, signal: controller.signal });
    if (mode === "abort") await assert.rejects(run, error => error === failure);
    else {
      const result = await run;
      assert.equal(result.status, "blocked");
      assert.match(result.answer, /^任务未完成/);
      if (mode !== "misleading") {
        assert.equal(result.answer, "任务未完成：安全检查拒绝访问。");
        assert(result.summaryError instanceof Error);
      }
    }
    assert.equal(decisions, 2);
    assert.deepEqual(executed, ["observe", "denied", "end"]);
  });
}
