/** Independently authored convenience entry; the AgentLoop stays transport-neutral. */
import { fileURLToPath } from "node:url";
import { readNativePermissions, nativeAppPolicyContext } from "./native-permissions";
import { randomUUID } from "node:crypto";
import {
  prepareRestoredRuntime,
  readRuntimeEnvironment,
} from "./restored-runtime";
const env = await readRuntimeEnvironment();
let sessionId: string | undefined;
if (env.CUA_REPL_ENABLED_SURFACES !== undefined || process.env.CUA_RUNTIME_SUPERVISOR === "rust" || process.env.CUA_RUNTIME_SUPERVISOR === "independent") {
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
      `Rust independent sandboxed runtime supervisor selected (${runtime.surfaces ?? "JavaScript-only"} surface; no installed supervisor).`,
    );
  if (runtime.supervisor === "rust" && runtime.surfaces?.split(",").includes("computer")) {
    const permissions = await readNativePermissions(env.CORE_CUA_NATIVE_HELPER_PATH ?? fileURLToPath(new URL("../../../native/macos/.build/debug/cua-helper", import.meta.url)));
    process.env.CUA_DEMO_NATIVE_PERMISSIONS = JSON.stringify({...permissions,requested:false});
    console.error(`Native UI permissions: accessibility=${permissions.accessibility}, screenRecording=${permissions.screenRecording}. App inventory does not verify UI access.`);
    const policy = JSON.parse(env.CORE_CUA_APP_POLICY ?? "{}");
    process.env.CUA_DEMO_NATIVE_POLICY_CONTEXT = nativeAppPolicyContext(policy);
    if (!Object.values(policy).some((rule:any) => rule?.decision === "allowed"))
      console.error("No native App is allowed by the standalone CORE_CUA_APP_POLICY configuration; inventory is available, but App operations require an explicit policy and interactive approval.");
  } else {
    delete process.env.CUA_DEMO_NATIVE_PERMISSIONS;
    delete process.env.CUA_DEMO_NATIVE_POLICY_CONTEXT;
  }
  if (runtime.dynamicBrowserDirectory) process.env.CUA_DEMO_BROWSER_STARTUP_DIRECTORY = runtime.dynamicBrowserDirectory;
  else delete process.env.CUA_DEMO_BROWSER_STARTUP_DIRECTORY;
  await import("./demo");
} finally {
  await runtime.dispose();
}
