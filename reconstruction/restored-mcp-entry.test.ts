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

for (const signal of ["SIGTERM", "SIGINT"] as const)
  test(
    `MCP ${signal} during package preparation cleans staging before native launch`,
    {
      skip:
        process.platform !== "darwin" ||
        process.env.CUA_TEST_NATIVE_SKY_IPC !== "1",
      timeout: 20000,
    },
    async () => {
      const { spawn, execFileSync } = await import("node:child_process");
      const parent = await mkdtemp(join(tmpdir(), "cua-interrupt-entry-"));
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "packages/agent-loop/src/restored-mcp.ts"],
        {
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: parent,
            CUA_MCP_ENV:
              '{"CUA_REPL_ENABLED_SURFACES":"computer","NODE_REPL_DISABLE_ANALYTICS":"1"}',
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      const closed = new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      try {
        const staged = async () =>
          (await readdir(parent)).filter((name) =>
            name.startsWith("cua-runtime-"),
          );
        const deadline = Date.now() + 10000;
        while (
          !(await staged()).length &&
          child.exitCode === null &&
          Date.now() < deadline
        )
          await new Promise((resolve) => setTimeout(resolve, 10));
        assert.ok(
          (await staged()).length,
          "Expected a live staging directory before interrupt",
        );
        // Query only this owned process's direct children, not the user's process inventory.
        let pids = "";
        try {
          pids = execFileSync("/usr/bin/pgrep", ["-P", String(child.pid)], {
            encoding: "utf8",
          }).trim();
        } catch (error: any) {
          if (error.status !== 1) throw error;
        }
        if (pids) {
          const commands = execFileSync(
            "/bin/ps",
            ["-p", pids.split(/\s+/).join(","), "-o", "comm="],
            { encoding: "utf8" },
          )
            .trim()
            .split("\n");
          // tsx may already own its esbuild service; the native supervisor must not exist yet.
          assert.ok(
            commands.every((command) =>
              /(?:^|\/)esbuild$/.test(command.trim()),
            ),
            commands.join("\n"),
          );
        }
        assert.equal(child.kill(signal), true);
        const result = await closed;
        assert.equal(result.signal, null);
        assert.equal(result.code, signal === "SIGTERM" ? 143 : 130, stderr);
        assert.equal(stdout, "");
        assert.deepEqual(await staged(), []);
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        await closed.catch(() => {});
        await rm(parent, { recursive: true, force: true });
      }
    },
  );
