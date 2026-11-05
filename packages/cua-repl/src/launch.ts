import { spawn } from "node:child_process";
import { once } from "node:events";
import { isAbsolute } from "node:path";
import process from "node:process";
import { create_launch_environment } from "./environment";
/** Original launch contract. The NodeREPL executable remains an explicit external dependency. */
export async function launch(): Promise<void> {
  const executable = process.env.CUA_REPL_NODE_REPL_PATH;
  if (!executable || !isAbsolute(executable))
    throw new Error("CUA_REPL_NODE_REPL_PATH must name an absolute executable");
  const child = spawn(executable, [], {
    env: create_launch_environment({
      env: process.env,
      instructions_directory: new URL(
        ".",
        import.meta.resolve("#instructions/banner.js"),
      ),
      platform: process.platform,
    }),
    stdio: "inherit",
  });
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const forward = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  for (const signal of signals) process.on(signal, forward);
  const [code, signal] = await once(child, "close").finally(() => {
    for (const signal of signals) process.off(signal, forward);
  });
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code != null && code >= 0 ? code : 1;
}
