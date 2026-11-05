/** Independently authored convenience entry; the AgentLoop stays transport-neutral. */
import { randomUUID } from "node:crypto";
import {
  prepareRestoredRuntime,
  readRuntimeEnvironment,
} from "./restored-runtime";
const env = await readRuntimeEnvironment();
let sessionId: string | undefined;
if (env.CUA_REPL_ENABLED_SURFACES !== undefined) {
  process.env.CUA_MCP_REQUEST_META ??= JSON.stringify({
    "x-codex-turn-metadata": {
      session_id: randomUUID(),
      turn_id: randomUUID(),
    },
  });
  const metadata = JSON.parse(process.env.CUA_MCP_REQUEST_META);
  const supplied = metadata?.["x-codex-turn-metadata"];
  const turn = typeof supplied === "string" ? JSON.parse(supplied) : supplied;
  sessionId = turn?.session_id;
  process.env.CUA_MCP_TURN_EVENT = JSON.stringify({
    hook_event_name: "turn_ended",
    session_id: sessionId,
    turn_id: turn?.turn_id,
  });
}
const runtime = await prepareRestoredRuntime(
  env,
  process.env.CUA_RUNTIME_SUPERVISOR,
  sessionId,
);
try {
  process.env.CUA_MCP_COMMAND = runtime.command;
  process.env.CUA_MCP_ARGS = JSON.stringify(runtime.args);
  process.env.CUA_MCP_ENV = JSON.stringify(runtime.environment);
  if (runtime.supervisor === "rust")
    console.error(
      `Rust independent sandboxed runtime supervisor selected (${runtime.surfaces} surface; no installed supervisor).`,
    );
  await import("./demo");
} finally {
  await runtime.dispose();
}
