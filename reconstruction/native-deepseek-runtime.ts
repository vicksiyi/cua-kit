/** Shared real Rust/Sky/Swift acceptance deployment, never a permission bypass. */
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { create_launch_environment } from "@core/cua-repl";
import { stageRuntimePackages } from "../packages/agent-loop/src/runtime-packages";
import { prepareIndependentRuntime } from "../packages/agent-loop/src/independent-runtime";
import { McpToolClient } from "../packages/agent-loop/src/mcp-client";
import { NodeReplTurnClient } from "../packages/agent-loop/src/node-repl-turn";

export async function connectNativeAcceptanceRuntime(bundleId: string) {
  const staged = await stageRuntimePackages([
    resolve("packages/sky"),
    resolve("packages/cua"),
  ]);
  let deployment:
    Awaited<ReturnType<typeof prepareIndependentRuntime>> | undefined;
  let client: McpToolClient | undefined;
  let turn: NodeReplTurnClient | undefined;
  let approvalCount = 0;
  const close = async () => {
    try {
      try {
        await turn?.endTurn();
      } finally {
        await client?.close();
      }
    } finally {
      try {
        await deployment?.dispose();
      } finally {
        await staged.dispose();
      }
    }
  };
  try {
    const metadata = { session_id: randomUUID(), turn_id: randomUUID() };
    const built = create_launch_environment({
      env: {
        CUA_REPL_ENABLED_SURFACES: "computer",
        CORE_CUA_NATIVE_BACKEND: "swift",
        CORE_CUA_APP_POLICY: JSON.stringify({
          [bundleId]: {
            decision: "allowed",
            risk: "low",
            allowPersistentApproval: false,
          },
        }),
        NODE_REPL_DISABLE_ANALYTICS: "1",
      },
      instructions_directory: new URL(
        "../packages/cua-repl/instructions/",
        import.meta.url,
      ),
      platform: process.platform,
    });
    const env = Object.fromEntries(
      Object.entries(built).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    deployment = await prepareIndependentRuntime(
      env,
      staged.root,
      metadata.session_id,
    );
    client = await McpToolClient.connect(
      {
        command: deployment.command,
        args: deployment.args,
        env: deployment.environment,
        stderr: "inherit",
      },
      {
        requestMeta: () => ({ "x-codex-turn-metadata": metadata }),
        elicit: async (params) => {
          const target = params._meta?.tool_params;
          const allowed =
            params.mode !== "url" &&
            params._meta?.connector_id === "computer-use" &&
            target !== null &&
            typeof target === "object" &&
            "app" in target &&
            target.app === bundleId;
          if (allowed) approvalCount++;
          return allowed
            ? { action: "accept", content: {} }
            : { action: "decline" };
        },
      },
    );
    turn = new NodeReplTurnClient(
      client,
      { ...metadata, hook_event_name: "turn_ended" },
      { defaultJsTimeoutMs: 60000 },
    );
    return {
      turn,
      client,
      deployment,
      stagedRoot: staged.root,
      approvalCount: () => approvalCount,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
