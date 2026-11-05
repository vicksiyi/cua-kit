import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";
import { readRuntimeEnvironment } from "../packages/agent-loop/src/restored-runtime";

test("server environment rejects model configuration before deployment", async () => {
  await assert.rejects(
    readRuntimeEnvironment({
      CUA_MCP_ENV: '{"DEEPSEEK_API_KEY":"fixture-not-secret"}',
    }),
    /must not be forwarded/,
  );
  await assert.rejects(
    readRuntimeEnvironment({ CUA_MCP_ENV: "[]" }),
    /JSON string map/,
  );
});

for (const entry of ["node", "npm"] as const)
  test(
    `${entry} MCP entry provides original guidance, native inventory and cleans staged files on close`,
    {
      skip:
        process.platform !== "darwin" ||
        process.env.CUA_TEST_NATIVE_SKY_IPC !== "1",
      timeout: 30000,
    },
    async () => {
      const parent = await mkdtemp(join(tmpdir(), "cua-stdio-entry-test-"));
      const metadata = { session_id: randomUUID(), turn_id: randomUUID() };
      let client: McpToolClient | undefined;
      let turn: NodeReplTurnClient | undefined;
      try {
        client = await McpToolClient.connect(
          {
            command: entry === "node" ? process.execPath : "npm",
            args:
              entry === "node"
                ? ["--import", "tsx", "packages/agent-loop/src/restored-mcp.ts"]
                : ["--silent", "run", "mcp"],
            env: {
              TMPDIR: parent,
              CUA_NATIVE_SUPERVISOR_PATH: "/nonexistent/installed-supervisor",
              CUA_MCP_ENV: JSON.stringify({
                CUA_REPL_ENABLED_SURFACES: "computer",
                NODE_REPL_DISABLE_ANALYTICS: "1",
              }),
            },
          },
          { requestMeta: () => ({ "x-codex-turn-metadata": metadata }) },
        );
        assert.ok(client.getInstructions());
        turn = new NodeReplTurnClient(client, {
          hook_event_name: "turn_ended",
          ...metadata,
        });
        const tools = await turn.listTools();
        assert.ok(tools.some((tool) => tool.name === "js"));
        assert.ok(!tools.some((tool) => tool.name === "turn_ended"));
        const result = await turn.callTool({
          id: "inventory",
          name: "js",
          arguments: {
            code: "nodeRepl.write(JSON.stringify({verified_native_inventory_count:(await cua.listApps({emit:false})).length}))",
          },
        });
        assert.notEqual(result.isError, true, JSON.stringify(result));
        assert.match(
          result.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n"),
          /"verified_native_inventory_count"\s*:\s*\d+/,
        );
        const reported = await turn.callTool({
          id: "summary",
          name: "js",
          arguments: { completion_summary: "Checked native inventory" },
        });
        assert.notEqual(reported.isError, true);
        assert.ok(
          (await readdir(parent)).some((name) =>
            name.startsWith("cua-runtime-"),
          ),
        );
        await turn.endTurn();
        await client.close();
        client = undefined;
        const stagedDirectories = async () =>
          (await readdir(parent)).filter((name) =>
            name.startsWith("cua-runtime-"),
          );
        for (
          let attempt = 0;
          attempt < 30 && (await stagedDirectories()).length;
          attempt++
        )
          await new Promise((resolve) => setTimeout(resolve, 100));
        assert.deepEqual(await stagedDirectories(), []);
      } finally {
        await client?.close();
        await rm(parent, { recursive: true, force: true });
      }
    },
  );
