/** Independently authored demo adapter; the native supervisor remains external. */
import { createRuntimeDiagnostics } from "./runtime-diagnostics";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";
import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entry = fileURLToPath(import.meta.url);
const workers = {
  "kernel.js": fileURLToPath(
    new URL("../../node-repl/dist/kernel.js", import.meta.url),
  ),
  "trusted-worker.js": fileURLToPath(
    new URL("../../node-repl/dist/trusted_worker.js", import.meta.url),
  ),
};
export function restoredWorkerCommand(argv: string[]) {
  const [assetDirectory, node, ...args] = argv;
  if (
    !assetDirectory ||
    !path.isAbsolute(assetDirectory) ||
    !node ||
    !path.isAbsolute(node)
  )
    throw new Error(
      "Expected native worker asset directory and absolute Node executable",
    );
  const indexes = args.flatMap((arg, index) =>
    path.isAbsolute(arg) &&
    path.dirname(arg) === assetDirectory &&
    Object.hasOwn(workers, path.basename(arg))
      ? [index]
      : [],
  );
  if (indexes.length !== 1)
    throw new Error(
      "Unrecognized native worker launch; expected exactly one recorded worker entry",
    );
  const index = indexes[0];
  args[index] = workers[path.basename(args[index]) as keyof typeof workers];
  return { command: node, args };
}
async function runChild(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  diagnoseWorker = false,
) {
  const diagnostics = diagnoseWorker
    ? createRuntimeDiagnostics((line) => console.error(line))
    : undefined;
  const child = spawn(command, args, {
    env,
    stdio: diagnostics ? ["pipe", "pipe", "inherit"] : "inherit",
  });
  const outputDrained = diagnostics
    ? finished(diagnostics.requests).catch(() => {})
    : undefined;
  if (diagnostics) {
    process.stdin.pipe(diagnostics.responses).pipe(child.stdin!);
    child
      .stdout!.pipe(diagnostics.requests)
      .pipe(process.stdout, { end: false });
    // A kernel reset can close the worker while the host still has input queued.
    child.stdin!.on("error", () => {});
  }
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  const forward = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  const handlers = signals.map((signal) => {
    const handler = () => forward(signal);
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
    await outputDrained;
    if (result.signal) {
      for (const { signal, handler } of handlers)
        process.removeListener(signal, handler);
      process.kill(process.pid, result.signal);
    } else process.exitCode = result.code ?? 1;
  } finally {
    if (diagnostics) {
      process.stdin.unpipe(diagnostics.responses);
      process.stdin.pause();
      diagnostics.responses.destroy();
      diagnostics.requests.destroy();
      diagnostics.close();
    }
    for (const { signal, handler } of handlers)
      process.removeListener(signal, handler);
  }
}
export class SupervisorCompatibilityError extends Error {}
export async function verifyNativeSupervisor(binary: string) {
  const manifest = JSON.parse(
    await readFile(
      new URL("../../../reconstruction/node-repl-source.json", import.meta.url),
      "utf8",
    ),
  );
  const digest = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  if (digest !== manifest.binarySha256 && !manifest.compatibleSupervisors?.some((item: { binarySha256: string }) => item.binarySha256 === digest))
    throw new SupervisorCompatibilityError(
      `Native supervisor differs from the verified build (${digest.slice(0, 12)}). 本机 ChatGPT runtime 已更新，需先验证新版本 worker 协议；本次未启动 MCP 或请求模型。`,
    );
}
export async function launchRestoredSupervisor(
  env: NodeJS.ProcessEnv = process.env,
) {
  const binary = env.CUA_NATIVE_SUPERVISOR_PATH;
  if (!binary || !path.isAbsolute(binary))
    throw new Error(
      "Set CUA_NATIVE_SUPERVISOR_PATH to the absolute native node_repl executable",
    );
  if (env.NODE_REPL_WORKER_WRAPPER !== undefined)
    throw new Error(
      "NODE_REPL_WORKER_WRAPPER is already configured; this adapter owns the worker substitution hook",
    );
  await verifyNativeSupervisor(binary);
  await Promise.all(Object.values(workers).map((worker) => access(worker)));
  const toolEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => !/(?:DEEPSEEK|CUA_MODEL)/i.test(key)),
  );
  toolEnv.NODE_REPL_WORKER_WRAPPER = JSON.stringify([
    process.execPath,
    "--import",
    import.meta.resolve("tsx"),
    entry,
    "--worker",
  ]);
  await runChild(binary, [], toolEnv);
}
async function main() {
  if (process.argv[2] === "--worker") {
    const launch = restoredWorkerCommand(process.argv.slice(3));
    await access(
      launch.args.find((arg) => Object.values(workers).includes(arg))!,
    );
    await runChild(
      launch.command,
      launch.args,
      process.env,
      process.env.CORE_CUA_RUNTIME_DIAGNOSTICS === "1" &&
        launch.args.includes(workers["trusted-worker.js"]),
    );
  } else {
    if (process.argv.length > 2)
      throw new Error(
        "This MCP adapter takes configuration through environment variables, not command arguments",
      );
    await launchRestoredSupervisor();
  }
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
