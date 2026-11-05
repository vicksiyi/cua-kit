/** Agent-neutral stdio entry: stdout belongs exclusively to the native MCP server. */
import { spawn } from "node:child_process";
import {
  prepareRestoredRuntime,
  readRuntimeEnvironment,
} from "./restored-runtime";
if (process.argv.length > 2)
  throw new Error(
    "Configure this MCP server through CUA_MCP_ENV, not command arguments",
  );
const runtime = await prepareRestoredRuntime(
  await readRuntimeEnvironment(),
  process.env.CUA_RUNTIME_SUPERVISOR,
);
try {
  const child = spawn(runtime.command, runtime.args, {
    env: runtime.environment,
    stdio: "inherit",
  });
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = signals.map((signal) => {
    const handler = () => {
      child.kill(signal);
    };
    process.on(signal, handler);
    return { signal, handler };
  });
  try {
    const result = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    process.exitCode =
      result.code ??
      (result.signal === "SIGINT"
        ? 130
        : result.signal === "SIGTERM"
          ? 143
          : 1);
  } finally {
    for (const { signal, handler } of handlers)
      process.removeListener(signal, handler);
  }
} finally {
  await runtime.dispose();
}
