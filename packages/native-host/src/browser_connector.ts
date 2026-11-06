import { authenticateNativeHostPipe } from "./pipe_authentication";
import type { NativePipeSocket } from "@core/browser/nativePipe";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, delimiter } from "node:path";
import { authenticateNativeHostSocket } from "./client";
import type { NativeHostEndpoint } from "./protocol";
import { discoverEndpointFiles, IndependentBrowserUnavailableError } from "./endpoint_configuration";
/** Read a private capability file. Its contents must never enter model context. */
async function readEndpoint(file: string): Promise<NativeHostEndpoint> {
  if (!isAbsolute(file))
    throw Error("Expected absolute @core endpoint file path");
  const [stat, parent] = await Promise.all([lstat(file), lstat(dirname(file))]);
  const uid = process.getuid?.();
  if (
    !stat.isFile() ||
    !parent.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    (parent.mode & 0o077) !== 0 ||
    (uid !== undefined && (stat.uid !== uid || parent.uid !== uid))
  )
    throw Error("@core endpoint must be private and owned by the current user");
  if (stat.size > 4096) throw Error("@core endpoint descriptor is too large");
  const value = JSON.parse(await readFile(file, "utf8")) as NativeHostEndpoint;
  if (
    value.version !== 1 ||
    typeof value.token !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.token) ||
    typeof value.socketPath !== "string" ||
    !isAbsolute(value.socketPath) ||
    await realpath(dirname(value.socketPath)) !== await realpath(dirname(file))
  )
    throw Error("Invalid @core endpoint descriptor");
  const socket = await lstat(value.socketPath);
  if (
    !socket.isSocket() ||
    (socket.mode & 0o077) !== 0 ||
    (uid !== undefined && socket.uid !== uid)
  )
    throw Error("@core socket must be private and owned by the current user");
  return { ...value, socketPath: await realpath(value.socketPath) };
}

/** A crashed host can leave a valid private descriptor and a dead socket behind.
 * Probe only authenticated transports; never delete files or hide policy/config errors.
 */
export async function discoverLiveEndpointFiles(directory: string): Promise<string[]> {
  const live: string[] = [];
  for (const file of await discoverEndpointFiles(directory)) {
    try {
      const endpoint = await readEndpoint(file);
      const socket = await authenticateNativeHostSocket(endpoint);
      socket.on("error", () => {});
      socket.destroy();
      live.push(await realpath(file));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ECONNREFUSED") throw error;
    }
  }
  if (!live.length) throw new IndependentBrowserUnavailableError("no_endpoints");
  return live;
}
/** Explicit composition point for assembleBrowserService.host.getNativePipeBridge.
 * Only registered @core socket paths are accepted; no arbitrary socket fallback.
 * Existing browser policy, elicitation and access verification remain in the service.
 */
export async function createBrowserServiceConnector(
  endpointFiles: readonly string[],
  connectPipe?: (path: string) => Promise<NativePipeSocket>,
) {
  // An explicit empty allowlist exposes no sockets; discovery must stay empty.
  const endpoints = await Promise.all(endpointFiles.map(readEndpoint));
  const allowed = new Map(
    endpoints.map((endpoint) => [endpoint.socketPath, endpoint]),
  );
  const bridge = Object.freeze({
    async createConnection(path: string) {
      const endpoint = allowed.get(path);
      if (!endpoint)
        throw Error("Socket is outside the configured @core host endpoints");
      if (connectPipe) return authenticateNativeHostPipe(endpoint, connectPipe);
      const socket = await authenticateNativeHostSocket(endpoint);
      // BrowserPipe installs listeners in the await continuation before this resumes.
      setImmediate(() => socket.resume());
      return socket;
    },
  });
  return {
    host: { getNativePipeBridge: () => bridge },
    environment: {
      BROWSER_USE_BACKEND_PATHS: [...allowed.keys()].join(delimiter),
    },
  };
}

export {
  parseEndpointFiles,
  discoverEndpointFiles,
  IndependentBrowserUnavailableError,
} from "./endpoint_configuration";
