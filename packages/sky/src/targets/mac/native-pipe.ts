import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  SkyComputerUseError,
  SkyComputerUseTransportError,
  ServerErrorCode,
} from "./errors";
export type CodexMetadata =
  string | Uint8Array | Record<string, unknown> | null | undefined;
export interface NativePipeConnection {
  end(): void;
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: () => void): void;
  off(event: "data", listener: (chunk: Uint8Array) => void): void;
  off(event: "error", listener: (error: Error) => void): void;
  off(event: "close", listener: () => void): void;
  write(data: Uint8Array): void;
}
type ConnectionFactory = (path: string) => Promise<NativePipeConnection>;
type HostServiceMethod = "ensureService";
const MAX_FRAME_BYTES = 8_388_608;
export function decodeMessageFrames(buffer: Buffer) {
  const messages: string[] = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const size = buffer.readUInt32LE(offset);
    if (size > MAX_FRAME_BYTES)
      throw new SkyComputerUseTransportError(
        `Sky Computer Use native pipe frame is too large: ${size}`,
      );
    const frameSize = 4 + size;
    if (buffer.length - offset < frameSize) break;
    messages.push(
      buffer.subarray(offset + 4, offset + frameSize).toString("utf8"),
    );
    offset += frameSize;
  }
  return { messages, remainingData: buffer.subarray(offset) };
}
export function encodeMessageFrame(message: string) {
  const bytes = Buffer.from(message, "utf8");
  if (bytes.length > MAX_FRAME_BYTES)
    throw new SkyComputerUseTransportError(
      `Sky Computer Use native pipe frame is too large: ${bytes.length}`,
    );
  const frame = Buffer.alloc(4 + bytes.length);
  frame.writeUInt32LE(bytes.length, 0);
  bytes.copy(frame, 4);
  return frame;
}
function codexMetadata(value: CodexMetadata) {
  return value == null ||
    (typeof value === "object" && !ArrayBuffer.isView(value))
    ? value
    : JSON.parse(Buffer.from(value as string).toString("utf8"));
}
type RpcResponse =
  | { id: number; jsonrpc: "2.0"; result: unknown }
  | { id: number; jsonrpc: "2.0"; error: { code: number; message: string } };
function parseResponse(value: any): RpcResponse {
  const invalid = () =>
    new SkyComputerUseTransportError(
      "Sky Computer Use returned an invalid JSON-RPC response",
    );
  if (
    typeof value !== "object" ||
    value == null ||
    !("id" in value) ||
    typeof value.id !== "number" ||
    !("jsonrpc" in value) ||
    value.jsonrpc !== "2.0"
  )
    throw invalid();
  const hasResult = Object.prototype.hasOwnProperty.call(value, "result");
  if (hasResult === Object.prototype.hasOwnProperty.call(value, "error"))
    throw invalid();
  if (hasResult)
    return {
      id: value.id,
      jsonrpc: "2.0",
      result: Reflect.get(value, "result"),
    };
  const error = Reflect.get(value, "error");
  if (
    typeof error !== "object" ||
    error == null ||
    !("code" in error) ||
    typeof error.code !== "number" ||
    !("message" in error) ||
    typeof error.message !== "string"
  )
    throw invalid();
  return {
    id: value.id,
    jsonrpc: "2.0",
    error: { code: error.code, message: error.message },
  };
}
function runtime(): any {
  const host = (globalThis as any).nodeRepl;
  if (host == null)
    throw new SkyComputerUseTransportError(
      "Sky Computer Use requires the trusted nodeRepl runtime",
    );
  return host;
}
function nonempty(value: unknown) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}
function asError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
class ConnectionUnavailable extends Error {
  constructor(error: unknown) {
    super(
      `Sky Computer Use native pipe is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
class ApiVersionMismatch extends SkyComputerUseTransportError {}
export class MacNativePipeTransport {
  #apiVersion: string;
  #nextId = 1;
  #buffer: Buffer = Buffer.alloc(0);
  #pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: unknown) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();
  #queue: Promise<void> = Promise.resolve();
  #socket: NativePipeConnection | null;
  static async create(apiVersion: string) {
    const bridge = runtime().nativePipe;
    if (bridge == null || typeof bridge.createConnection !== "function")
      throw new SkyComputerUseTransportError(
        "Sky Computer Use native pipe is unavailable",
      );
    const pipePath =
      nonempty(runtime().env?.SKY_CUA_SERVICE_NATIVE_PIPE_PATH) ??
      path.join(
        homedir(),
        "Library",
        "Group Containers",
        "2DC432GLL2.com.openai.sky.CUAService",
        "IPC",
        "computeruse.sock",
      );
    try {
      return await this.connect(
        bridge.createConnection,
        pipePath,
        apiVersion,
        250,
      );
    } catch (error) {
      if (!(error instanceof ConnectionUnavailable)) throw error;
      try {
        await startService(runtime());
      } catch (cause) {
        throw new SkyComputerUseTransportError(
          "Sky Computer Use service startup request failed",
          { cause },
        );
      }
      try {
        return await this.connect(
          bridge.createConnection,
          pipePath,
          apiVersion,
          5000,
        );
      } catch (cause) {
        throw new SkyComputerUseTransportError(
          "Sky Computer Use native pipe startup failed",
          { cause },
        );
      }
    }
  }
  private static async connect(
    create: ConnectionFactory,
    pipePath: string,
    apiVersion: string,
    timeoutMs: number,
  ) {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new ConnectionUnavailable(lastError);
      let socket: NativePipeConnection | undefined;
      const connecting = create(pipePath);
      try {
        socket = await withTimeout(
          connecting,
          remaining,
          "Sky Computer Use native pipe connection timed out",
        );
      } catch (error) {
        connecting.then(
          (late) => late.end(),
          () => {},
        );
        lastError = error;
      }
      if (socket != null) {
        const transport = new MacNativePipeTransport(socket, apiVersion);
        try {
          await transport.ping(
            Math.min(1000, Math.max(1, deadline - Date.now())),
          );
          return transport;
        } catch (error) {
          transport.#close();
          if (
            error instanceof ApiVersionMismatch ||
            (error instanceof SkyComputerUseError &&
              error.code === ServerErrorCode.incompatibleClientVersion)
          )
            throw error;
          lastError = error;
        }
      }
      if (Date.now() >= deadline) throw new ConnectionUnavailable(lastError);
      await sleep(100);
    }
  }
  constructor(socket: NativePipeConnection, apiVersion: string) {
    this.#apiVersion = apiVersion;
    this.#socket = socket;
    socket.on("data", (chunk) => {
      try {
        this.#receive(chunk);
      } catch (error) {
        this.#fail(asError(error));
        socket.end();
      }
    });
    socket.on("error", (error) => this.#fail(error));
    socket.on("close", () =>
      this.#fail(
        new Error("Sky Computer Use native pipe closed before response"),
      ),
    );
  }
  get isClosed() {
    return this.#socket == null;
  }
  async request<T>(args: {
    codexMetadata: CodexMetadata;
    request: unknown;
    requestType: string;
    timeoutSeconds: number;
  }): Promise<T> {
    const timeout = args.timeoutSeconds * 1000;
    const pending = this.#queue.then(() =>
      this.#send(
        "request",
        {
          clientApiVersion: this.#apiVersion,
          codexTurnMetadata: codexMetadata(args.codexMetadata),
          deadlineUnixMilliseconds: Date.now() + timeout,
          request: args.request,
          requestType: args.requestType,
        },
        timeout,
      ),
    );
    this.#queue = pending.then(
      () => {},
      () => {},
    );
    return await pending;
  }
  private async ping(timeout: number) {
    const response = await this.#send(
      "ping",
      { clientApiVersion: this.#apiVersion },
      timeout,
    );
    if (response.serverApiVersion !== this.#apiVersion)
      throw new ApiVersionMismatch(
        `Sky Computer Use API version mismatch: client=${this.#apiVersion} server=${String(response.serverApiVersion)}`,
      );
  }
  #send(method: string, params: unknown, timeout: number): Promise<any> {
    const socket = this.#socket;
    if (socket == null)
      throw new SkyComputerUseTransportError(
        "Sky Computer Use native pipe is closed",
      );
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.#fail(
            new SkyComputerUseTransportError(
              `Sky Computer Use ${method} timed out`,
            ),
          );
          socket.end();
        }, timeout),
      });
      try {
        socket.write(
          encodeMessageFrame(
            JSON.stringify({ id, jsonrpc: "2.0", method, params }),
          ),
        );
      } catch (error) {
        const pending = this.#pending.get(id);
        if (pending != null) {
          this.#pending.delete(id);
          clearTimeout(pending.timeout);
        }
        reject(asError(error));
      }
    });
  }
  #receive(chunk: Uint8Array) {
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk)]);
    const decoded = decodeMessageFrames(this.#buffer);
    this.#buffer = decoded.remainingData;
    for (const message of decoded.messages) {
      const response = parseResponse(JSON.parse(message)),
        pending = this.#pending.get(response.id);
      if (pending == null) continue;
      this.#pending.delete(response.id);
      clearTimeout(pending.timeout);
      if ("error" in response)
        pending.reject(
          new SkyComputerUseError({
            code: response.error.code,
            message: response.error.message,
            request: null,
            requestType: "jsonRPC",
          }),
        );
      else pending.resolve(response.result);
    }
  }
  #fail(error: unknown) {
    if (this.#socket != null) {
      this.#socket = null;
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      this.#pending.clear();
    }
  }
  #close() {
    const socket = this.#socket;
    this.#socket = null;
    socket?.end();
  }
}
async function startService(host: any) {
  if (nonempty(host.env?.NODE_REPL_HOST_SERVICES_PIPE_PATH) != null) {
    await requestComputerUseHost("ensureService", { service: "computer-use" });
    return;
  }
  const launch = host.launchServices?.openApplication;
  if (typeof launch !== "function")
    throw new Error(
      "Sky Computer Use requires nodeRepl.launchServices support",
    );
  const configured = nonempty(host.env?.SKY_CUA_SERVICE_PATH),
    home = nonempty(host.env?.CODEX_HOME);
  let application: { applicationPath: string } | { bundleIdentifier: string };
  if (configured != null) application = { applicationPath: configured };
  else if (
    home != null &&
    existsSync(path.join(home, "computer-use", "Codex Computer Use.app"))
  )
    application = {
      applicationPath: path.join(
        home,
        "computer-use",
        "Codex Computer Use.app",
      ),
    };
  else application = { bundleIdentifier: "com.openai.sky.CUAService" };
  await launch(application);
}
async function requestComputerUseHost(
  method: HostServiceMethod,
  params: Record<string, string>,
): Promise<void> {
  const host = runtime(),
    pipePath = nonempty(host.env?.NODE_REPL_HOST_SERVICES_PIPE_PATH);
  if (pipePath == null)
    throw new Error("Computer Use desktop host is unavailable");
  const create = host.nativePipe?.createConnection;
  if (typeof create !== "function")
    throw new Error("Sky Computer Use requires nodeRepl.nativePipe support");
  const connecting = create(pipePath);
  let socket: NativePipeConnection;
  try {
    socket = await withTimeout<NativePipeConnection>(
      connecting,
      5000,
      "Sky Computer Use host service connection timed out",
    );
  } catch (error) {
    connecting.then(
      (late: NativePipeConnection) => late.end(),
      () => {},
    );
    throw error;
  }
  try {
    await exchangeHostRequest(socket, method, params);
  } finally {
    socket.end();
  }
}
function exchangeHostRequest(
  socket: NativePipeConnection,
  method: HostServiceMethod,
  params: Record<string, string>,
) {
  return new Promise<void>((resolve, reject) => {
    const id = 0;
    let buffer: Buffer = Buffer.alloc(0),
      settled = false;
    const timer = setTimeout(
      () => finish(new Error("Sky Computer Use host service ensure timed out")),
      5000,
    );
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off("data", data);
      socket.off("error", failed);
      socket.off("close", closed);
      if (error == null) resolve();
      else reject(error);
    };
    const data = (chunk: Uint8Array) => {
      try {
        buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
        const decoded = decodeMessageFrames(buffer);
        buffer = decoded.remainingData;
        for (const message of decoded.messages) {
          const response = JSON.parse(message);
          if (
            typeof response === "object" &&
            response != null &&
            "id" in response &&
            response.id === id
          ) {
            if ("error" in response) {
              const error = response.error;
              finish(
                new Error(
                  typeof error === "object" &&
                    error != null &&
                    "message" in error &&
                    typeof error.message === "string"
                    ? error.message
                    : "Sky Computer Use host service ensure failed",
                ),
              );
            } else if ("result" in response) finish();
            else
              finish(
                new Error("Sky Computer Use host service returned an invalid response"),
              );
          }
        }
      } catch (error) {
        finish(asError(error));
      }
    };
    const failed = (error: Error) => finish(error);
    const closed = () =>
      finish(
        new Error("Sky Computer Use host service connection closed before response"),
      );
    socket.on("data", data);
    socket.on("error", failed);
    socket.on("close", closed);
    try {
      socket.write(
        encodeMessageFrame(
          JSON.stringify({ id, jsonrpc: "2.0", method, params }),
        ),
      );
    } catch (error) {
      finish(asError(error));
    }
  });
}
