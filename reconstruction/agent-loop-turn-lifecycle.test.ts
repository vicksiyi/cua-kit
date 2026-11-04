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
