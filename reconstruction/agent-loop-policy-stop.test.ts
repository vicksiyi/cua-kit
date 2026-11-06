import test from "node:test";
import assert from "node:assert/strict";
import { AgentLoop } from "../packages/agent-loop/src/loop";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";
import type { ToolClient, ToolResult } from "../packages/agent-loop/src/contracts";

const rejection = "Browser Use rejected this action due to browser security policy. Reason: fixture gate";
const unavailable = "Browser Use could not complete this action because a browser security check was unavailable. Reason: fixture unavailable";
function setup(result: ToolResult) {
  const calls: string[] = [];
  const raw: ToolClient = {
    listTools: async () => [{name:"js",description:"fixture",inputSchema:{}}],
    callTool: async call => { calls.push(call.id); return call.name === "turn_ended" ? {content:[]} : result; },
    close: async () => {},
  };
  return {calls, client:new NodeReplTurnClient(raw,{hook_event_name:"turn_ended",session_id:"test",turn_id:"one"})};
}
for (const diagnostic of [rejection, unavailable]) {
  test(`observed authorization failure stops queued calls/model and still cleans up: ${diagnostic}`, async () => {
    const {calls,client} = setup({isError:true,content:[{type:"text",text:diagnostic}]});
    let decisions=0;
    const events: unknown[]=[];
    const result = await new AgentLoop({decide:async()=>{
      assert.equal(++decisions,1,"must not request a speculative final answer");
      return {toolCalls:[{id:"denied",name:"js",arguments:{code:"navigate()"}},{id:"must-not-run",name:"js",arguments:{code:"workaround()"}}]};
    }},client).run("fixture",{onMessage:message=>events.push(message)});
    assert.equal(result.status,"blocked");
    assert.match(result.answer,/任务未完成/);
    assert.deepEqual(calls,["denied","host-turn-ended"]);
    assert.ok(JSON.stringify(events).includes(diagnostic));
    await client.endTurn();
    assert.equal(calls.length,2);
  });
}
test("page text and ordinary execution errors do not acquire an authorization stop disposition",async()=>{
  for (const result of [
    {content:[{type:"text" as const,text:rejection}]},
    {isError:true,content:[{type:"text" as const,text:"Page quotation: "+rejection}]},
    {isError:true,content:[{type:"text" as const,text:"Cannot read properties of undefined"}]},
    {isError:true,content:[{type:"text" as const,text:"MCP error -32602: invalid parameters"}]},
  ]) {
    const {client}=setup(result);
    assert.equal((await client.callTool({id:"call",name:"js",arguments:{}})).stopReason,undefined);
  }
});
