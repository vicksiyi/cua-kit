import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { AgentLoop } from "../packages/agent-loop/src/loop";
const require = createRequire(import.meta.url);

test("real MCP parameter rejection reaches the model for correction; transport errors remain fatal", async () => {
  const root = await mkdtemp(join(tmpdir(), "core-mcp-errors-"));
  let client: McpToolClient | undefined;
  try {
    const moduleUrl = (name: string) => JSON.stringify(pathToFileURL(require.resolve(name)).href);
    const fixture = join(root, "server.mjs");
    await writeFile(fixture, `
import { Server } from ${moduleUrl("@modelcontextprotocol/sdk/server/index.js")};
import { StdioServerTransport } from ${moduleUrl("@modelcontextprotocol/sdk/server/stdio.js")};
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from ${moduleUrl("@modelcontextprotocol/sdk/types.js")};
const server = new Server({name:"fixture",version:"1"},{capabilities:{tools:{}}});
let executions = 0;
server.setRequestHandler(ListToolsRequestSchema, async () => ({tools:[{name:"js",inputSchema:{type:"object"}}]}));
server.setRequestHandler(CallToolRequestSchema, async request => {
 const args = request.params.arguments;
 if (args.close) { process.exit(0); }
 if (args.internal) throw new McpError(ErrorCode.InternalError, "fixture internal failure");
 if (args.code && args.completion_summary) throw new McpError(ErrorCode.InvalidParams,"js: unknown field code, expected completion_summary");
 executions++;
 return {content:[{type:"text",text:JSON.stringify({executions,args})}]};
});
await server.connect(new StdioServerTransport());`);
    client = await McpToolClient.connect({command:process.execPath,args:[fixture],env:{}});
    let decisions = 0;
    const result = await new AgentLoop({decide:async input => {
      if (decisions++ === 0) return {toolCalls:[{id:"bad",name:"js",arguments:{code:"action()",completion_summary:"done"}}]};
      if (decisions === 2) {
        const last = input.messages.at(-1)!;
        assert.equal(last.role,"tool");
        if (last.role !== "tool") throw Error("missing error result");
        assert.equal(last.result.isError,true);
        assert.match(JSON.stringify(last.result.content),/expected completion_summary/);
        return {toolCalls:[{id:"fixed",name:"js",arguments:{completion_summary:"done"}}]};
      }
      assert.match(JSON.stringify(input.messages.at(-1)), /executions\\\":1/);
      return {text:"Corrected without executing the invalid call"};
    }},client).run("fixture",{maxSteps:3});
    assert.match(result.answer,/Corrected/);
    await assert.rejects(client.callTool({id:"internal",name:"js",arguments:{internal:true}}), error => error instanceof McpError && error.code === ErrorCode.InternalError);
    await assert.rejects(client.callTool({id:"close",name:"js",arguments:{close:true}}), /[Cc]onnection closed/);
  } finally { await client?.close(); await rm(root,{recursive:true,force:true}); }
});
