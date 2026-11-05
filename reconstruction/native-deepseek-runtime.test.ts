import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { connectNativeAcceptanceRuntime } from "./native-deepseek-runtime";
import { computerPreflight } from "../packages/agent-loop/src/computer-preflight";

test(
  "desktop acceptance deployment uses real Rust/Sky/Swift and source startup guidance without a model request",
  {
    skip:
      process.platform !== "darwin" ||
      process.env.CUA_TEST_NATIVE_SKY_IPC !== "1",
    timeout: 20000,
  },
  async () => {
    const runtime = await connectNativeAcceptanceRuntime(
      "com.core.acceptance." + randomUUID(),
    );
    const root = dirname(runtime.deployment.args[0]);
    try {
      assert.match(
        runtime.deployment.command,
        /native\/runtime-supervisor\/dist\/core-runtime-supervisor$/,
      );
      const spec = JSON.parse(
        await readFile(runtime.deployment.args[0], "utf8"),
      );
      assert.deepEqual(spec.services, ["sky"]);
      assert.deepEqual(
        JSON.parse(
          spec.trusted.sandbox.worker_environment.NODE_REPL_TRUSTED_SERVICES,
        ),
        { sky: "@core/sky/service" },
      );
      assert.match(spec.native_service.helper, /cua-helper$/);
      assert.ok(spec.completion_summary.instructions.length > 0);
      assert.ok(spec.kernel.sandbox.worker_environment.NODE_REPL_JS_BANNER);
      const tools = await runtime.turn.listTools();
      assert.ok(!tools.some((tool) => tool.name === "turn_ended"));
      assert.ok(
        (
          tools.find((tool) => tool.name === "js")!.inputSchema
            .properties as any
        ).completion_summary,
      );
      assert.ok(runtime.turn.getInstructions());
      await computerPreflight(runtime.turn, {
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(
        runtime.approvalCount(),
        0,
        "Inventory must not authorize an app or start a model",
      );
    } finally {
      await runtime.close();
    }
    await assert.rejects(access(root));
    await assert.rejects(access(runtime.stagedRoot));
  },
);
