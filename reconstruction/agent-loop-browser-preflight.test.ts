import assert from "node:assert/strict";
import test from "node:test";
import { browserPreflight } from "../packages/agent-loop/src/browser-preflight";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import type {
  ToolClient,
  ToolResult,
} from "../packages/agent-loop/src/contracts";
function fixture(result: ToolResult) {
  let calls = 0;
  const client: ToolClient = {
    async listTools() {
      return [];
    },
    async callTool() {
      return ++calls === 1
        ? { content: [{ type: "text", text: "API documentation" }] }
        : result;
    },
    async close() {},
  };
  return client;
}
test("preflight rejects empty, malformed and failed backend inventory", async () => {
  for (const result of [
    { content: [{ type: "text", text: '{"cuaBrowserCount":0}' }] },
    { content: [{ type: "text", text: "not JSON" }] },
    {
      content: [{ type: "text", text: '{"cuaBrowserCount":1}' }],
      isError: true,
    },
  ] satisfies ToolResult[]) {
    await assert.rejects(
      browserPreflight(fixture(result)),
      /No connected|could not verify/,
    );
  }
});
test("successful preflight evidence reaches the model with matching tool call IDs", async () => {
  const tools = fixture({
    content: [{ type: "text", text: '{"cuaBrowserCount":1}' }],
  });
  const initialMessages = await browserPreflight(tools);
  let ended = 0;
  tools.endTurn = async () => {
    ended++;
  };
  const loop = new AgentLoop(
    {
      async decide(input) {
        assert.equal(input.messages.length, 5);
        assert.deepEqual(input.messages.slice(1), initialMessages);
        return { text: "ready" };
      },
    },
    tools,
  );
  assert.equal((await loop.run("search", { initialMessages })).answer, "ready");
  assert.equal(ended, 1);
  assert.equal(initialMessages.length, 4);
});
