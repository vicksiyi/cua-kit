import assert from "node:assert/strict";
import test from "node:test";
import { browserPreflight } from "../packages/agent-loop/src/browser-preflight";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import type {
  ToolClient,
  ToolResult,
} from "../packages/agent-loop/src/contracts";
function fixture(result: ToolResult) {
  const client: ToolClient = {
    async listTools() {
      return [];
    },
    async callTool(call) {
      return call.arguments.code === "await cua.getState();"
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
      browserPreflight(fixture(result), {wait:async()=>{}}),
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

test('retry preserves first documentation and unique call IDs when inventory recovers', async () => {
  const calls: import('../packages/agent-loop/src/contracts').ToolCall[] = [];
  let waits = 0, inventory = 0;
  const tools: ToolClient = {
    listTools:async()=>[],close:async()=>{},
    async callTool(call) {
      calls.push(call);
      if(call.arguments.code === 'await cua.getState();') return {content:[{type:'text',text:calls.length === 1 ? 'FIRST-API-DOCUMENTATION' : 'state only'}]};
      assert.match(String(call.arguments.code),/cua.getState\(\{emit:false\}\)/);
      return {content:[{type:'text',text:JSON.stringify({cuaBrowserCount:inventory++ === 0 ? 0 : 1})}]};
    },
  };
  const messages = await browserPreflight(tools,{wait:async ms=>{assert.equal(ms,2000);waits++;}});
  assert.equal(waits,1);assert.equal(calls.length,4);
  assert.equal(new Set(calls.map(call=>call.id)).size,4);
  assert.equal(messages.length,8);
  assert.match(JSON.stringify(messages),/FIRST-API-DOCUMENTATION/);
  for(let i=0;i<messages.length;i+=2){
    const request=messages[i],reply=messages[i+1];
    assert.ok(request.role==='assistant'&&reply.role==='tool');
    assert.equal(request.toolCalls![0].id,reply.callId);
  }
});
test('cancellation during retry wait prevents a second tool call',async()=>{
  const controller=new AbortController();let calls=0;
  const tools:ToolClient={listTools:async()=>[],close:async()=>{},callTool:async()=>{calls++;return {isError:true,content:[]};}};
  await assert.rejects(browserPreflight(tools,{signal:controller.signal,wait:async()=>{controller.abort();controller.signal.throwIfAborted();}}),{name:'AbortError'});
  assert.equal(calls,1);
});
test('transport exceptions do not retry a closed MCP client',async()=>{
  const failure=new Error('connection closed');let calls=0;
  const tools:ToolClient={listTools:async()=>[],close:async()=>{},callTool:async()=>{calls++;throw failure;}};
  await assert.rejects(browserPreflight(tools),error=>error===failure);
  assert.equal(calls,1);
});
