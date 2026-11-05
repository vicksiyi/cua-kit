/** Agent-neutral stdio entry: stdout belongs exclusively to the native MCP server. */
import { spawn, type ChildProcess } from "node:child_process";
import {
  prepareRestoredRuntime,
  readRuntimeEnvironment,
} from "./restored-runtime";
if (process.argv.length > 2)
  throw new Error(
    "Configure this MCP server through CUA_MCP_ENV, not command arguments",
  );
const controller = new AbortController();
let child: ChildProcess | undefined;
let runtime: Awaited<ReturnType<typeof prepareRestoredRuntime>> | undefined;
let interrupted: NodeJS.Signals | undefined;
const exitCode = (signal: NodeJS.Signals | null) =>
  signal === "SIGINT"
    ? 130
    : signal === "SIGTERM"
      ? 143
      : signal === "SIGHUP"
        ? 129
        : 1;
const handlers = (["SIGINT", "SIGTERM", "SIGHUP"] as NodeJS.Signals[]).map(
  (signal) => {
    const handler = () => {
      interrupted ??= signal;
      controller.abort(new Error(`Runtime startup interrupted by ${signal}`));
      child?.kill(signal);
    };
    process.on(signal, handler);
    return { signal, handler };
  },
);
try {
  runtime = await prepareRestoredRuntime(
    await readRuntimeEnvironment(),
    process.env.CUA_RUNTIME_SUPERVISOR,
    undefined,
    controller.signal,
  );
  controller.signal.throwIfAborted();
  child = spawn(runtime.command, runtime.args, {
    env: runtime.environment,
    stdio: "inherit",
  });
  const result = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child!.once("error", reject);
    child!.once("close", (code, signal) => resolve({ code, signal }));
  });
  process.exitCode = result.code ?? exitCode(result.signal);
} catch (error) {
  if (interrupted && error === controller.signal.reason)
    process.exitCode = exitCode(interrupted);
  else throw error;
} finally {
  try {
    await runtime?.dispose();
  } finally {
    for (const { signal, handler } of handlers)
      process.removeListener(signal, handler);
  }
}
