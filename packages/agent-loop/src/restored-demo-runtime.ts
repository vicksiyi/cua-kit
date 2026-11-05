import { verifyNativeSupervisor } from "./native-supervisor";
import { prepareIndependentRuntime } from "./independent-runtime";
/** Independently authored convenience entry; the AgentLoop stays transport-neutral. */
import { withHostProxy } from "./system-proxy";
import { fileURLToPath } from "node:url";
import { delimiter } from "node:path";
import { configureIndependentBrowser } from "./independent-browser";
import { randomUUID } from "node:crypto";
import { create_launch_environment } from "@core/cua-repl";
import {
  stageRuntimePackages,
  restoredPackageSources,
} from "./runtime-packages";
const configured: unknown = JSON.parse(process.env.CUA_MCP_ENV ?? "{}");
if (
  !configured ||
  typeof configured !== "object" ||
  Array.isArray(configured) ||
  !Object.values(configured).every((value) => typeof value === "string")
)
  throw new Error("CUA_MCP_ENV must be a JSON string map");
let env = await withHostProxy({ ...configured } as Record<string, string>);
for (const key of [
  "CUA_NATIVE_SUPERVISOR_PATH",
  "NODE_REPL_NODE_PATH",
  "CORE_CUA_ENDPOINT_FILES",
  "CORE_CUA_HOST_DIRECTORY",
  "CORE_CUA_RUNTIME_DIAGNOSTICS",
  "CORE_CUA_NATIVE_BACKEND",
  "CORE_CUA_NATIVE_HELPER_PATH",
  "CORE_CUA_APP_POLICY",
])
  if (env[key] === undefined && process.env[key] !== undefined)
    env[key] = process.env[key]!;
const supervisor = process.env.CUA_RUNTIME_SUPERVISOR ?? "installed";
if (!["installed", "independent", "rust"].includes(supervisor)) throw Error("CUA_RUNTIME_SUPERVISOR must be installed, independent or rust");
if (supervisor === "installed") {
  if (!env.CUA_NATIVE_SUPERVISOR_PATH)
    throw new Error("Set CUA_NATIVE_SUPERVISOR_PATH for demo:restored");
  await verifyNativeSupervisor(env.CUA_NATIVE_SUPERVISOR_PATH);
}
// Explicit surfaces opt into CUA initialization; absent retains generic JS mode.
if (env.CUA_REPL_ENABLED_SURFACES !== undefined) {
  env = create_launch_environment(env) as Record<string, string>;
  process.env.CUA_MCP_REQUEST_META ??= JSON.stringify({
    "x-codex-turn-metadata": {
      session_id: randomUUID(),
      turn_id: randomUUID(),
    },
  });
  const metadata = JSON.parse(process.env.CUA_MCP_REQUEST_META);
  const supplied = metadata?.["x-codex-turn-metadata"];
  const turn = typeof supplied === "string" ? JSON.parse(supplied) : supplied;
  process.env.CUA_MCP_TURN_EVENT = JSON.stringify({
    hook_event_name: "turn_ended",
    session_id: turn?.session_id,
    turn_id: turn?.turn_id,
  });
}
if (env.CORE_CUA_NATIVE_BACKEND === "independent") {
  if (!env.CUA_REPL_ENABLED_SURFACES?.split(",").some(surface => surface.trim() === "computer")) throw new Error("Independent native backend requires computer surface");
  const services = JSON.parse(env.NODE_REPL_TRUSTED_SERVICES ?? "{}");
  if (services.sky && services.sky !== "@core/sky/service") throw new Error("Independent native backend conflicts with configured Sky service");
  services.sky = "@core/native-macos/service";
  env.NODE_REPL_TRUSTED_SERVICES = JSON.stringify(services);
} else if (env.CORE_CUA_NATIVE_BACKEND === "swift") {
  if (supervisor !== "rust") throw new Error("Swift native backend requires CUA_RUNTIME_SUPERVISOR=rust");
} else if (env.CORE_CUA_NATIVE_BACKEND !== undefined && env.CORE_CUA_NATIVE_BACKEND !== "vendor") {
  throw new Error("CORE_CUA_NATIVE_BACKEND must be independent, swift or vendor");
}
if (env.CUA_REPL_ENABLED_SURFACES?.split(",").some(surface=>surface.trim()==="browser")) env = await configureIndependentBrowser(env);
process.env.CUA_MCP_COMMAND = process.execPath;
process.env.CUA_MCP_ARGS = JSON.stringify([
  "--import",
  import.meta.resolve("tsx"),
  fileURLToPath(new URL("./native-supervisor.ts", import.meta.url)),
]);
const runtime = await stageRuntimePackages(restoredPackageSources());
let independent: Awaited<ReturnType<typeof prepareIndependentRuntime>> | undefined;
try {
  env.NODE_REPL_NODE_MODULE_DIRS = [
    runtime.root,
    env.NODE_REPL_NODE_MODULE_DIRS,
  ]
    .filter(Boolean)
    .join(delimiter);
  env.NODE_REPL_TRUSTED_CODE_PATHS = [
    runtime.root,
    env.NODE_REPL_TRUSTED_CODE_PATHS,
  ]
    .filter(Boolean)
    .join(delimiter);
  if (supervisor === "independent" || supervisor === "rust") {
    const turn = JSON.parse(process.env.CUA_MCP_TURN_EVENT ?? "{}");
    independent = await prepareIndependentRuntime(env, runtime.root, turn.session_id, supervisor === "rust" ? "rust" : "typescript");
    process.env.CUA_MCP_COMMAND = independent.command;
    process.env.CUA_MCP_ARGS = JSON.stringify(independent.args);
    process.env.CUA_MCP_ENV = JSON.stringify(independent.environment);
    process.env.CUA_MCP_BOOTSTRAP = "core-cua";
    console.error(`${supervisor === "rust" ? "Rust" : "TypeScript"} independent sandboxed runtime supervisor selected (${env.CUA_REPL_ENABLED_SURFACES} surface; no installed supervisor).`);
  } else {
    delete process.env.CUA_MCP_BOOTSTRAP;
    process.env.CUA_MCP_ENV = JSON.stringify(env);
  }
  await import("./demo");
} finally {
  await independent?.dispose();
  await runtime.dispose();
}
