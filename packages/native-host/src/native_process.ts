/** Caller/deployment binding to the Rust host. No TS socket server or RPC router. */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable, Writable } from "node:stream";
import { assertPrivateEndpointDirectory } from "./endpoint_configuration";
import type { NativeHostEndpoint } from "./protocol";

export async function resolveRustNativeHostExecutable(
  executable = fileURLToPath(
    new URL(
      "../../../native/browser-extension-host/dist/core-browser-extension-host",
      import.meta.url,
    ),
  ),
) {
  await access(executable, constants.X_OK).catch(() => {
    throw Error(
      "Build the Rust browser host first: npm run build:rust-browser-host",
    );
  });
  return realpath(executable);
}
export async function startRustNativeHost(
  input: Readable,
  output: Writable,
  options: {
    parentDirectory: string;
    executable?: string;
    startupTimeoutMs?: number;
  },
) {
  const executable = await resolveRustNativeHostExecutable(options.executable);
  await assertPrivateEndpointDirectory(options.parentDirectory);
  const parent = await realpath(options.parentDirectory);
  const deployment = await mkdtemp(join(parent, "native-process-"));
  const extensionId = "p".repeat(32); // Owned internal CDP bridge identity, not an installed extension identity.
  const config = join(deployment, "config.json");
  try {
    await writeFile(
      config,
      JSON.stringify({
        version: 1,
        extensionIds: [extensionId],
        endpointParentDirectory: parent,
      }),
      { mode: 0o600, flag: "wx" },
    );
  } catch (error) {
    await rm(deployment, { recursive: true, force: true });
    throw error;
  }
  const env = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR"].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]!]],
    ),
  );
  const child = spawn(
    executable,
    ["--config", config, `chrome-extension://${extensionId}/`],
    { cwd: deployment, env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once("error", () => resolve({ code: null, signal: null }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let endpointFile: string | undefined;
  let endpointIdentity: { dev: number; ino: number } | undefined;
  let disposed: Promise<void> | undefined;
  const dispose = () =>
    (disposed ??= (async () => {
      input.unpipe(child.stdin);
      child.stdout.unpipe(output);
      input.off("error", onInputError);
      output.off("error", onOutputError);
      if (endpointFile && endpointIdentity) {
        const directory = dirname(endpointFile);
        const current = await lstat(directory).catch(() => undefined);
        if (
          current?.isDirectory() &&
          current.dev === endpointIdentity.dev &&
          current.ino === endpointIdentity.ino
        ) {
          await rm(endpointFile, { force: true });
          await rm(join(directory, "host.sock"), { force: true });
          // Only the two known owned files; preserve unexpected directory contents.
          const { rmdir } = await import("node:fs/promises");
          await rmdir(directory).catch(() => {});
        }
      }
      await rm(deployment, { recursive: true, force: true });
    })());
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      input.unpipe(child.stdin);
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      }, 2000);
      timer.unref();
      try {
        await exited;
        await dispose();
      } finally {
        clearTimeout(timer);
      }
    })());
  const onInputError = () => {
    void close().catch(() => {});
  };
  const onOutputError = () => {
    void close().catch(() => {});
  };
  input.on("error", onInputError);
  output.on("error", onOutputError);
  child.stdin.on("error", onInputError);
  input.pipe(child.stdin);
  child.stdout.pipe(output, { end: false });
  void exited.then(() => dispose()).catch(() => {});
  let line = "";
  let resolveReady!: (file: string) => void;
  const ready = new Promise<string>((resolve) => (resolveReady = resolve));
  child.stderr.on("data", (bytes) => {
    line = (line + bytes.toString()).slice(-16384);
    const match = line.match(/@core native host endpoint: ([^\r\n]+)[\r\n]/);
    if (match) resolveReady(match[1]);
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const file = await Promise.race([
      ready,
      exited.then(({ code }) => {
        throw Error(
          `Rust browser host exited before ready (code ${code ?? "unavailable"})`,
        );
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Rust browser host startup timed out")),
          options.startupTimeoutMs ?? 5000,
        );
      }),
    ]);
    if (
      basename(file) !== "endpoint.json" ||
      dirname(dirname(file)) !== parent ||
      !basename(dirname(file)).startsWith("core-cua-")
    )
      throw Error(
        "Rust host published an endpoint outside its configured parent",
      );
    const directory = await lstat(dirname(file));
    if (!directory.isDirectory() || (directory.mode & 0o077) !== 0)
      throw Error("Rust host endpoint directory is not private");
    endpointIdentity = { dev: directory.dev, ino: directory.ino };
    endpointFile = file;
    const endpoint = JSON.parse(
      await readFile(file, "utf8"),
    ) as NativeHostEndpoint;
    if (
      endpoint.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(endpoint.token) ||
      endpoint.socketPath !== join(dirname(file), "host.sock")
    )
      throw Error("Invalid Rust host endpoint descriptor");
    return { endpoint, endpointFile: file, processId: child.pid!, close };
  } catch (error) {
    await close();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
