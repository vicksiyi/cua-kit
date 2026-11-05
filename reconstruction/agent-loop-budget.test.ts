import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { AgentLoop, AgentStepBudgetError, ChatCompletionsModel } from "../packages/agent-loop/src/index";
import type { ModelAdapter, ToolClient } from "../packages/agent-loop/src/contracts";

function fixture() {
  const actions: string[] = [];
  const tools: ToolClient = {
    async listTools() { return [{ name: "observe", description: "Read fixture", inputSchema: {} }]; },
    async callTool(call) {
      actions.push(call.name);
      return { content: [{ type: "text", text: "Observed first result: https://fixture.invalid/exact/path" }] };
    },
    async endTurn() { actions.push("end"); },
    async close() {},
  };
  return { tools, actions };
}
const call = { id: "read", name: "observe", arguments: {} };

test("budget summary includes last observation over actual HTTP, disables tools and still rejects as incomplete", async () => {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    requests.push(JSON.parse(body));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: requests.length === 1
      ? { tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: "{}" } }] }
      : { content: "Incomplete: observed https://fixture.invalid/exact/path, further verification remains." } }] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const { tools, actions } = fixture();
  try {
    await assert.rejects(new AgentLoop(new ChatCompletionsModel({
      endpoint: `http://127.0.0.1:${address.port}`, apiKey: "fixture-only", model: "fixture",
    }), tools).run("Find a result", { maxSteps: 1, summarizeOnExhaustion: true }), error => {
      assert(error instanceof AgentStepBudgetError);
      assert.match(error.partialSummary!, /exact\/path/);
      return true;
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].tools, undefined);
    assert.equal(requests[1].tool_choice, "none");
    assert.equal(requests[1].messages.at(-1).tool_call_id, "read");
    assert.match(requests[1].messages.at(-1).content, /exact\/path/);
    assert.deepEqual(actions, ["observe", "end"]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

for (const mode of ["calls", "empty", "error", "abort", "disabled"] as const) {
  test(`budget ${mode} preserves stop/cleanup and never executes extra actions`, async () => {
    const { tools, actions } = fixture();
    const controller = new AbortController();
    const failure = new Error("summary transport failure");
    let requests = 0;
    const model: ModelAdapter = { async decide(input) {
      if (++requests === 1) return { toolCalls: [call] };
      assert.deepEqual(input.tools, []);
      if (mode === "calls") return { text: "pretend success", toolCalls: [{ ...call, id: "forbidden" }] };
      if (mode === "error") throw failure;
      if (mode === "abort") { controller.abort(failure); return { text: "discard this" }; }
      return {};
    } };
    await assert.rejects(new AgentLoop(model, tools).run("read", {
      maxSteps: 1, summarizeOnExhaustion: mode !== "disabled", signal: controller.signal,
    }), error => {
      if (mode === "abort") assert.equal(error, failure);
      else {
        assert(error instanceof AgentStepBudgetError);
        assert.equal(error.partialSummary, undefined);
        if (mode === "error") assert.equal(error.cause, failure);
      }
      return true;
    });
    assert.equal(requests, mode === "disabled" ? 1 : 2);
    assert.deepEqual(actions, ["observe", "end"]);
  });
}
