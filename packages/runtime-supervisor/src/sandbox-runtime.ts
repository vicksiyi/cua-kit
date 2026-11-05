/** Explicit composition for recovered workers; independently authored, no installed supervisor dependency. */
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { createReadonlyConfigHost, type ReadonlyConfigSources } from "./config-host";
import { UnixNativePipeHost } from "./native-pipe-host";
import { ProcessWorkerPort } from "./process-port";
import { sandboxedWorkerSpec, type SandboxedWorkerOptions } from "./sandbox-launcher";
import type { SessionOptions } from "./session";
import { serveSupervisorStdio } from "./stdio";

export interface SandboxedRuntimeOptions {
  kernel: SandboxedWorkerOptions;
  trusted: SandboxedWorkerOptions;
  services: readonly string[];
  pipePaths: readonly string[];
  config: ReadonlyConfigSources;
}
const contains = (parent: string, child: string) => {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};
/** Validate both policies before either process starts, including cross-worker isolation. */
export async function createSandboxedSessionOptions(options: SandboxedRuntimeOptions): Promise<SessionOptions> {
  const [kernel, trusted] = await Promise.all([
    sandboxedWorkerSpec(options.kernel), sandboxedWorkerSpec(options.trusted),
  ]);
  if (contains(kernel.cwd, trusted.cwd) || contains(trusted.cwd, kernel.cwd))
    throw Error("Kernel and trusted writable directories must be disjoint");
  const [kernelReads, trustedReads] = await Promise.all([
    Promise.all(options.kernel.readDirectories.map(path => realpath(path))),
    Promise.all(options.trusted.readDirectories.map(path => realpath(path))),
  ]);
  if (kernelReads.some(path => (contains(path, trusted.cwd) || contains(trusted.cwd, path))) ||
      trustedReads.some(path => (contains(path, kernel.cwd) || contains(kernel.cwd, path))))
    throw Error("Read grants must not expose the other worker's writable directory");
  if (kernel.env.CORE_CUA_ENDPOINT_FILES !== undefined || kernel.env.BROWSER_USE_BACKEND_PATHS !== undefined)
    throw Error("Browser endpoint configuration belongs only to the trusted worker");
  const services = [...options.services];
  if (services.some(name => typeof name !== "string" || !name) || new Set(services).size !== services.length)
    throw Error("Services must have unique nonempty names");
  const configured: unknown = JSON.parse(trusted.env.NODE_REPL_TRUSTED_SERVICES ?? "{}");
  if (!configured || typeof configured !== "object" || Array.isArray(configured) ||
      !Object.values(configured).every(value => typeof value === "string" && value.length > 0) ||
      Object.keys(configured).length !== services.length || services.some(name => !Object.hasOwn(configured, name)))
    throw Error("Supervisor services must match trusted worker configuration");
  const paths = [...options.pipePaths];
  if (paths.some(path => !isAbsolute(path) || path.includes("\0"))) throw Error("Pipe endpoints must be explicit absolute paths");
  const hostRequest = createReadonlyConfigHost(options.config);
  return {
    services,
    hostRequest,
    nativePipeHost: emit => new UnixNativePipeHost(paths, emit),
    launch: async () => {
      if (process.platform !== "darwin") throw Error("Sandboxed runtime requires macOS");
      const first = await ProcessWorkerPort.start(kernel);
      try { return { kernel: first, trusted: await ProcessWorkerPort.start(trusted) }; }
      catch (error) { await first.close(); throw error; }
    },
  };
}
/** MCP stdio entry for any client. Caller owns staged packages, config and scratch lifetime. */
export async function serveSandboxedStdio(options: SandboxedRuntimeOptions,
  io?: Parameters<typeof serveSupervisorStdio>[1]) {
  return serveSupervisorStdio(await createSandboxedSessionOptions(options), io);
}
