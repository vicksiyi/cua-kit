import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
// A real stdio MCP exchange with a fixture inventory. No live-browser claim.
const fixture = `
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
const server = new Server({name:'inventory-fixture',version:'1'}, {capabilities:{tools:{}}});
server.setRequestHandler(CallToolRequestSchema, async request => {
  const code = request.params.arguments.code;
  if (code === 'await cua.getState();') return {content:[{type:'text',text:'fixture documentation'}]};
  if (!code.includes('cuaBrowserCount')) throw Error('Unexpected page action');
  return {content:[{type:'text',text:JSON.stringify({cuaBrowserCount:Number(process.env.FIXTURE_COUNT)})}]};
});
await server.connect(new StdioServerTransport());
`;
async function run(count: number, surfaces = "browser") {
  return await new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "packages/agent-loop/src/demo.ts",
          "--check-browser",
        ],
        {
          cwd,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            // Model construction must be skipped, even for an invalid provider.
            CUA_MODEL_PROVIDER: "must-not-be-used",
            CUA_MCP_COMMAND: process.execPath,
            CUA_MCP_ARGS: JSON.stringify([
              "--input-type=module",
              "-e",
              fixture,
            ]),
            CUA_MCP_ENV: JSON.stringify({
              CUA_REPL_ENABLED_SURFACES: surfaces,
              FIXTURE_COUNT: String(count),
            }),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    },
  );
}
test("browser check uses real MCP without constructing a model or taking page actions", async () => {
  const result = await run(1);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Browser connection verified/);
  assert.match(result.output, /No model request or page action/);
});
test("browser check rejects absent browser and disabled surface", async () => {
  const empty = await run(0);
  assert.notEqual(empty.code, 0);
  assert.match(empty.output, /No connected browser backend/);
  const disabled = await run(1, "");
  assert.notEqual(disabled.code, 0);
  assert.match(disabled.output, /requires the browser surface/);
});
