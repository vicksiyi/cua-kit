import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDebugLog } from "../packages/agent-loop/src/debug-log";
import {
  AgentLoop,
  AgentStepBudgetError,
} from "../packages/agent-loop/src/loop";

test("local debug retains full tool evidence, redacts credentials and records exhausted turn cleanup", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-debug-test-"));
  try {
    const log = createDebugLog(dir, ["fixture-secret-value"]);
    let ended = 0;
    const text = "visible page ".repeat(6000) + "fixture-secret-value";
    const tools = log.tools({
      async listTools() {
        return [{ name: "js", description: "fixture", inputSchema: {} }];
      },
      async callTool() {
        return {
          content: [
            { type: "text" as const, text },
            {
              type: "image" as const,
              data: "fakebase64",
              mimeType: "image/png",
            },
          ],
        };
      },
      async endTurn() {
        ended++;
      },
      async close() {},
    });
    const model = log.model({
      async decide() {
        return {
          toolCalls: [
            {
              id: "call-1",
              name: "js",
              arguments: { code: "observe()", token: "hidden-token" },
            },
          ],
        };
      },
    });
    await assert.rejects(
      new AgentLoop(model, tools).run("inspect", { maxSteps: 1 }),
      AgentStepBudgetError,
    );
    assert.equal(ended, 1);
    log.write("run.error", new AgentStepBudgetError(1));
    log.write("secret.fixture", {
      text: "Bearer fixture-auth sk-1234567890123456789",
      password: "hidden-pass",
    });
    const raw = await readFile(log.file, "utf8");
    for (const value of [
      "fixture-secret-value",
      "hidden-token",
      "hidden-pass",
      "fixture-auth",
      "sk-1234567890123456789",
      "fakebase64",
    ])
      assert.ok(!raw.includes(value), value);
    assert.ok(raw.includes("visible page ".repeat(6000)));
    const rows = raw
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      rows.some((row) => row.event === "model.request" && row.data.step === 1),
    );
    assert.ok(
      rows.some(
        (row) => row.event === "tool.result" && row.data.durationMs >= 0,
      ),
    );
    assert.ok(rows.some((row) => row.event === "turn.end.result"));
    assert.equal((await stat(log.file)).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tool transport failures are recorded and rethrown without substituting success", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cua-debug-error-"));
  try {
    const log = createDebugLog(dir);
    const tools = log.tools({
      async listTools() {
        return [];
      },
      async callTool() {
        throw Error("CDP disconnected");
      },
      async close() {},
    });
    await assert.rejects(
      tools.callTool({ id: "x", name: "js", arguments: {} }),
      /CDP disconnected/,
    );
    assert.match(await readFile(log.file, "utf8"), /tool.error/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
