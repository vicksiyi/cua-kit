/** Independent experimental macOS launcher; no ambient environment or raw profile input. */
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { ProcessWorkerPort } from "./process-port";

export interface SandboxedWorkerOptions {
  node: string;
  bootstrap: string;
  addon: string;
  entry: string;
  args: readonly string[];
  directory: string;
  readDirectories: readonly string[];
  /** Only restored worker configuration keys are accepted, never Node/loader options. */
  workerEnvironment?: Readonly<Record<string, string>>;
  terminateGraceMs?: number;
}
const workerKeys = new Set([
  "NODE_REPL_TRUSTED_RPC_ENABLED",
  "NODE_REPL_NODE_MODULE_DIRS",
  "NODE_REPL_UNTRUSTED_ENV_ALLOWLIST",
  "CUA_REPL_ENABLED_SURFACES",
  "CUA_REPL_BROWSER_ENV",
  "NODE_REPL_TRUSTED_SERVICES",
  "NODE_REPL_TRUSTED_CODE_PATHS",
]);
const contains = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};
async function canonical(path: string, directory: boolean) {
  if (!isAbsolute(path) || /[\x00-\x1f\x7f]/.test(path)) throw Error("Sandbox paths must be absolute and contain no control characters");
  const resolved = await realpath(path);
  const info = await stat(resolved);
  if (directory ? !info.isDirectory() : !info.isFile()) throw Error("Unexpected sandbox path type");
  if (directory && dirname(resolved) === resolved) throw Error("Filesystem root cannot be a sandbox grant");
  return resolved;
}
/** Caller owns immutable trusted code and dedicated scratch directories; paths are not inode-pinned. */
export async function sandboxedWorkerSpec(options: SandboxedWorkerOptions) {
  const [node, bootstrap, addon, entry, directory] = await Promise.all([
    canonical(options.node, false), canonical(options.bootstrap, false),
    canonical(options.addon, false), canonical(options.entry, false), canonical(options.directory, true),
  ]);
  const reads = [...new Set(await Promise.all(options.readDirectories.map(path => canonical(path, true))))];
  if (!reads.some(path => contains(path, entry))) throw Error("Worker entry must be in an explicit read directory");
  if (reads.some(path => contains(path, directory) || contains(directory, path)) ||
      [node, bootstrap, addon, entry].some(path => contains(directory, path)))
    throw Error("Writable worker directory must be separate from trusted code and read directories");
  const env: Record<string, string> = { HOME: directory, TMPDIR: directory };
  for (const [key, value] of Object.entries(options.workerEnvironment ?? {})) {
    if (!workerKeys.has(key) || typeof value !== "string" || value.includes("\0"))
      throw Error("Unsupported worker environment key or value");
    env[key] = value;
  }
  const ancestors = new Set<string>();
  for (const path of [...reads, directory]) {
    for (let ancestor = dirname(path); ; ancestor = dirname(ancestor)) {
      ancestors.add(ancestor);
      if (dirname(ancestor) === ancestor) break;
    }
  }
  const rule = (kind: string, path: string) => `(${kind} ${JSON.stringify(path)})`;
  env.CORE_CUA_SANDBOX_PROFILE = [
    "(version 1)(deny default)",
    `(allow file-read* ${reads.map(path => rule("subpath", path)).join(" ")})`,
    `(allow file-read* file-write* ${rule("subpath", directory)})`,
    `(allow file-read-metadata ${[...ancestors].map(path => rule("literal", path)).join(" ")})`,
    "(allow sysctl-read)(allow signal (target self))",
  ].join("");
  env.CORE_CUA_SANDBOX_ADDON = addon;
  return { command: node, args: ["--experimental-vm-modules", bootstrap, entry, ...options.args],
    cwd: directory, env, terminateGraceMs: options.terminateGraceMs };
}
export async function launchSandboxedWorker(options: SandboxedWorkerOptions) {
  if (process.platform !== "darwin") throw Error("macOS sandbox launcher is unavailable on this platform");
  return ProcessWorkerPort.start(await sandboxedWorkerSpec(options));
}
