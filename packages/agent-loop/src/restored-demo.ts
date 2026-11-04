/** Independently authored convenience entry; the AgentLoop stays transport-neutral. */
import { fileURLToPath } from "node:url";
const configured: unknown = JSON.parse(process.env.CUA_MCP_ENV ?? "{}");
if (
  !configured ||
  typeof configured !== "object" ||
  Array.isArray(configured) ||
  !Object.values(configured).every((value) => typeof value === "string")
)
  throw new Error("CUA_MCP_ENV must be a JSON string map");
const env = { ...configured } as Record<string, string>;
for (const key of ["CUA_NATIVE_SUPERVISOR_PATH", "NODE_REPL_NODE_PATH"])
  if (env[key] === undefined && process.env[key] !== undefined)
    env[key] = process.env[key]!;
if (!env.CUA_NATIVE_SUPERVISOR_PATH)
  throw new Error("Set CUA_NATIVE_SUPERVISOR_PATH for demo:restored");
process.env.CUA_MCP_COMMAND = process.execPath;
process.env.CUA_MCP_ARGS = JSON.stringify([
  "--import",
  import.meta.resolve("tsx"),
  fileURLToPath(new URL("./native-supervisor.ts", import.meta.url)),
]);
process.env.CUA_MCP_ENV = JSON.stringify(env);
await import("./demo");
