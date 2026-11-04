import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  AgentLoop,
  McpToolClient,
  createDemoModel,
} from "../packages/agent-loop/src/index";
const require = createRequire(import.meta.url);
test("DeepSeek adapter completes model→real MCP stdio→tool result→answer with provider isolation", async () => {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    requests.push(input);
    assert.equal(req.headers.authorization, "Bearer test-only-key");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            message:
              requests.length === 1
                ? {
                    content: null,
                    tool_calls: [
                      {
                        id: "call-1",
                        type: "function",
                        function: { name: "observe", arguments: "{}" },
                      },
                    ],
                  }
                : { content: "Fixture page contains a heading." },
          },
        ],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const directory = await mkdtemp(join(tmpdir(), "agent-mcp-test-"));
  let client: McpToolClient | undefined;
  try {
    const fixture = join(directory, "fixture.mjs");
    await writeFile(
      fixture,
      `import { McpServer } from ${JSON.stringify(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/mcp.js")).href)};
import { StdioServerTransport } from ${JSON.stringify(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/stdio.js")).href)};
const server = new McpServer({name:'fixture',version:'1'});
server.registerTool('observe',{description:'Observe fixture page',inputSchema:{}},async()=>({content:[{type:'text',text:'Fixture heading'}]}));
await server.connect(new StdioServerTransport());`,
    );
    client = await McpToolClient.connect({
      command: process.execPath,
      args: [fixture],
      env: {},
    });
    const model = createDemoModel({
      DEEPSEEK_API_KEY: "test-only-key",
      CUA_MODEL_ENDPOINT: `http://127.0.0.1:${address.port}/chat/completions`,
    });
    const result = await new AgentLoop(model, client).run(
      "Analyze the fixture page",
      { maxSteps: 3 },
    );
    assert.equal(result.answer, "Fixture page contains a heading.");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].model, "deepseek-flash");
    assert.deepEqual(requests[0].thinking, { type: "disabled" });
    assert.equal(requests[0].tools[0].function.name, "observe");
    assert.equal(requests[1].messages.at(-1).tool_call_id, "call-1");
    assert.match(requests[1].messages.at(-1).content, /Fixture heading/);
    assert.equal(JSON.stringify(requests).includes("test-only-key"), false);
  } finally {
    await client?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
test("model configuration requires explicit credentials and keeps alternate providers selectable", () => {
  assert.throws(() => createDemoModel({}), /DEEPSEEK_API_KEY/);
  assert.throws(
    () => createDemoModel({ CUA_MODEL_PROVIDER: "unknown" }),
    /Unsupported/,
  );
  assert.throws(
    () =>
      createDemoModel({
        CUA_MODEL_PROVIDER: "openai-compatible",
        DEEPSEEK_API_KEY: "not-for-this-provider",
      }),
    /CUA_MODEL_API_KEY/,
  );
  assert(
    createDemoModel({
      CUA_MODEL_PROVIDER: "openai-compatible",
      CUA_MODEL_API_KEY: "test-only",
      CUA_MODEL: "custom",
      CUA_MODEL_ENDPOINT: "http://localhost/test",
    }),
  );
});

test("MCP request metadata follows host turn context independently of model tool arguments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-mcp-meta-"));
  let client: McpToolClient | undefined;
  try {
    const fixture = join(directory, "fixture.mjs");
    await writeFile(
      fixture,
      `import { McpServer } from ${JSON.stringify(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/mcp.js")).href)};
import { StdioServerTransport } from ${JSON.stringify(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/stdio.js")).href)};
const server = new McpServer({name:'metadata-fixture',version:'1'});
server.registerTool('observe',{inputSchema:{}},async(args,extra)=>({content:[{type:'text',text:JSON.stringify({args,meta:extra._meta})}]}));
await server.connect(new StdioServerTransport());`,
    );
    let turn = "one";
    client = await McpToolClient.connect(
      { command: process.execPath, args: [fixture], env: {} },
      {
        requestMeta: () => ({ "fixture-context": { session: "same", turn } }),
      },
    );
    for (const current of ["one", "two"]) {
      turn = current;
      const result = await client.callTool({
        id: current,
        name: "observe",
        arguments: {},
      });
      const content = result.content[0];
      assert.equal(content.type, "text");
      if (content.type !== "text") throw Error("Expected text");
      assert.deepEqual(JSON.parse(content.text), {
        args: {},
        meta: { "fixture-context": { session: "same", turn: current } },
      });
    }
  } finally {
    await client?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
