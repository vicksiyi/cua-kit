import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentLoop,
  NodeReplTurnClient,
  parseNodeReplTurnEvent,
} from "../packages/agent-loop/src/index";
import type {
  ToolClient,
  ToolCall,
  ModelAdapter,
} from "../packages/agent-loop/src/contracts";
const event = {
  hook_event_name: "turn_ended",
  session_id: "session",
  turn_id: "turn",
};
function fixture(failCleanup = false) {
  const calls: Array<{ call: ToolCall; signal?: AbortSignal }> = [];
  const client: ToolClient = {
    async listTools() {
      return ["js", "turn_ended"].map((name) => ({
        name,
        description: name,
        inputSchema: {},
      }));
    },
    async callTool(call, signal) {
      calls.push({ call, signal });
      return {
        content: [
          { type: "text", text: failCleanup ? "cleanup failed" : "ok" },
        ],
        isError: failCleanup,
      };
    },
    async close() {},
  };
  return { calls, turn: new NodeReplTurnClient(client, event) };
}
for (const outcome of ["success", "failure", "abort"] as const)
  test(`host ends the turn after ${outcome}, with no cancelled cleanup signal`, async () => {
    const { turn, calls } = fixture();
    const controller = new AbortController();
    const failure = new Error("fixture model failure");
    const model: ModelAdapter = {
      async decide({ tools }) {
        assert.deepEqual(
          tools.map((t) => t.name),
          ["js"],
        );
        if (outcome === "failure") throw failure;
        if (outcome === "abort") {
          controller.abort(failure);
          controller.signal.throwIfAborted();
        }
        return { text: "answer" };
      },
    };
    const run = new AgentLoop(model, turn).run("fixture", {
      signal: controller.signal,
    });
    if (outcome === "success") assert.equal((await run).answer, "answer");
    else await assert.rejects(run, (error) => error === failure);
    await turn.endTurn();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].signal, undefined);
    assert.deepEqual(calls[0].call.arguments, event);
    assert.equal(calls[0].call.name, "turn_ended");
    await assert.rejects(
      turn.callTool({ id: "late", name: "js", arguments: {} }),
      /has ended/,
    );
  });
test("cleanup errors remain visible and do not erase the original failure", async () => {
  for (const modelFails of [false, true]) {
    const { turn, calls } = fixture(true);
    const failure = new Error("primary");
    await assert.rejects(
      new AgentLoop(
        {
          async decide() {
            if (modelFails) throw failure;
            return { text: "answer" };
          },
        },
        turn,
      ).run("fixture"),
      (error) => {
        if (modelFails) {
          assert.ok(error instanceof AggregateError);
          assert.equal(error.errors[0], failure);
          assert.match(String(error.errors[1]), /cleanup failed/);
        } else assert.match(String(error), /cleanup failed/);
        return true;
      },
    );
    await assert.rejects(turn.endTurn(), /cleanup failed/);
    assert.equal(calls.length, 1);
  }
});
test("turn lifecycle cannot be invoked by model tools and rejects invalid host events", async () => {
  const { turn, calls } = fixture();
  await assert.rejects(
    turn.callTool({ id: "model", name: "turn_ended", arguments: event }),
    /host lifecycle/,
  );
  assert.equal(calls.length, 0);
  for (const value of [
    null,
    {},
    { ...event, turn_id: "" },
    { ...event, extra: true },
  ])
    assert.throws(() => parseNodeReplTurnEvent(value));
});

test("host JS deadline default preserves explicit timeouts and does not mutate model calls", async () => {
  const calls: any[] = [];
  const client = {
    listTools: async () => [],
    close: async () => {},
    callTool: async (call: any) => {
      calls.push(call);
      return { content: [] };
    },
  };
  const turn = new NodeReplTurnClient(
    client,
    { hook_event_name: "turn_ended", session_id: "s", turn_id: "t" },
    { defaultJsTimeoutMs: 60000 },
  );
  const call = { id: "a", name: "js", arguments: { code: "42" } };
  await turn.callTool(call);
  await turn.callTool({
    id: "b",
    name: "js",
    arguments: { code: "42", timeout_ms: 100 },
  });
  await turn.callTool({ id: "c", name: "js_reset", arguments: {} });
  assert.deepEqual(call.arguments, { code: "42" });
  assert.equal(calls[0].arguments.timeout_ms, 60000);
  assert.equal(calls[1].arguments.timeout_ms, 100);
  assert.deepEqual(calls[2].arguments, {});
  for (const args of [{completion_summary:'Read fixture result'}, {completion_summary:null}, {completion_summary:'Invalid mixed call',code:'42'}, {}]) {
    const summary = {id:'summary',name:'js',arguments:args};
    await turn.callTool(summary);
    assert.strictEqual(calls.at(-1),summary);
    assert.ok(!Object.hasOwn(calls.at(-1).arguments,'timeout_ms'));
  }
});

for (const when of ["before-start", "during-model-final", "during-model-tools"] as const) {
  test(`loop honors cancellation ${when} even when adapters return normally`, async () => {
    const controller = new AbortController();
    const cancelled = new Error("caller cancelled");
    let inventoryCalls = 0, modelCalls = 0, toolCalls = 0, cleanups = 0;
    const delivered: unknown[] = [];
    const client: ToolClient = {
      async listTools() { inventoryCalls++; return [{ name: "js", description: "fixture", inputSchema: {} }]; },
      async callTool() { toolCalls++; return { content: [] }; },
      async endTurn() { cleanups++; }, async close() {},
    };
    const model: ModelAdapter = { async decide() {
      modelCalls++;
      controller.abort(cancelled);
      // Simulates a non-cooperative adapter or completion racing cancellation.
      return when === "during-model-tools"
        ? { toolCalls: [{ id: "late", name: "js", arguments: {} }] }
        : { text: "late success" };
    } };
    if (when === "before-start") controller.abort(cancelled);
    await assert.rejects(new AgentLoop(model, client).run("fixture", {
      signal: controller.signal, onMessage: message => delivered.push(message),
    }), error => error === cancelled);
    assert.equal(inventoryCalls, when === "before-start" ? 0 : 1);
    assert.equal(modelCalls, when === "before-start" ? 0 : 1);
    assert.equal(toolCalls, 0);
    assert.equal(cleanups, 1);
    assert.deepEqual(delivered, []);
  });
}
