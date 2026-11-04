import test from "node:test";
import assert from "node:assert/strict";
import { computerPreflight } from "../packages/agent-loop/src/computer-preflight";
import type { ToolClient, ToolResult, AgentMessage } from "../packages/agent-loop/src/contracts";
const fixture = (result: ToolResult): ToolClient => ({
  listTools: async () => [], callTool: async () => result, close: async () => {},
});
test("computer preflight requires affirmative native inventory evidence", async () => {
  for (const value of [null, {}, {cuaComputerConnected:true}, {cuaComputerConnected:true,appCount:-1}, {cuaComputerConnected:false,appCount:3}])
    await assert.rejects(computerPreflight(fixture({content:[{type:"text",text:JSON.stringify(value)}]})), /could not be verified/);
  await assert.rejects(computerPreflight(fixture({isError:true,content:[{type:"text",text:'{"cuaComputerConnected":true,"appCount":1}'}]})), /could not be verified/);
});
test("empty successful app inventory is valid and trace is preserved for AgentLoop", async () => {
  const events: AgentMessage[] = [];
  const result = await computerPreflight(fixture({content:[{type:"text",text:'{"cuaComputerConnected":true,"appCount":0}'}]}), {onMessage: message => events.push(message)});
  assert.deepEqual(events, result);
  assert.equal(result.length, 2);
  assert.equal((result[1] as any).callId, (result[0] as any).toolCalls[0].id);
});
