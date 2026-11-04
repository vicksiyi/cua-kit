import { AsyncResource } from "node:async_hooks";
import { Buffer } from "node:buffer";
import type { WindowsComputerUseTransport } from "./computer_use_client_base";
export type NativePipeConnection = {
  on(event: string, callback: (...args: any[]) => void): unknown;
  write(frame: Uint8Array): unknown;
  end(): unknown;
};
type Elicit = (request: unknown) => Promise<unknown>;
export type WindowsNativePipeHost = {
  config?: unknown;
  env?: Record<string, string | undefined>;
  nativePipe?: {
    createConnection?: (path: string) => Promise<NativePipeConnection>;
  };
  createElicitation?: Elicit;
};
type Pending = {
  createElicitation: Elicit | undefined;
  method: string;
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  timeoutMs: number;
};
const intrinsicThen = Promise.prototype.then;
export class WindowsNativePipeTransport implements WindowsComputerUseTransport {
  #create: (path: string) => Promise<NativePipeConnection>;
  #elicit: Elicit | undefined;
  #path: string;
  #timeout: number | undefined;
  #closed = false;
  #connection: Promise<NativePipeConnection> | null = null;
  #nextId = 1;
  #size = 0;
  #chunks: Buffer[] = [];
  #pending = new Map<number, Pending>();
  #queue: Promise<void> = Promise.resolve();
  #active: NativePipeConnection | null = null;
  constructor(host: WindowsNativePipeHost, timeoutMs?: number) {
    const create = host.nativePipe?.createConnection;
    if (host.config == null || typeof create !== "function")
      throw new Error("Computer Use native pipe is unavailable");
    const directory = host.env?.SKY_CUA_NATIVE_PIPE_DIRECTORY?.trim();
    if (!directory)
      throw new Error("Computer Use native pipe path is unavailable");
    this.#create = create;
    this.#elicit = host.createElicitation;
    this.#path = directory;
    this.#timeout = timeoutMs;
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    const pending = this.#connection;
    if (pending == null) return;
    let connection: NativePipeConnection;
    try {
      connection = await pending;
    } catch {
      return;
    }
    if (this.#active === connection) {
      this.#active = null;
      this.#connection = null;
      this.#size = 0;
      this.#chunks = [];
      this.#rejectAll(
        new Error("Computer Use native pipe closed before response"),
      );
      connection.end();
    }
  }
  request(
    method: string,
    params: Record<string, unknown>,
    options: { codexTurnMetadata?: unknown } = {},
  ) {
    const elicit =
      typeof this.#elicit === "function"
        ? AsyncResource.bind(this.#elicit)
        : undefined;
    const result = this.#queue.then(async () => {
      if (this.#closed) throw new Error("Computer Use native pipe is closed");
      const connection = await this.#connect();
      if (this.#closed) throw new Error("Computer Use native pipe is closed");
      if (this.#active !== connection)
        throw new Error("Computer Use native pipe closed before response");
      return this.#send(
        connection,
        "request",
        { codexTurnMetadata: options.codexTurnMetadata, method, params },
        method,
        elicit,
      );
    });
    this.#queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  #connect(): Promise<NativePipeConnection> {
    if (this.#connection == null) {
      let attempt: Promise<NativePipeConnection> | null = null;
      attempt = (async () => {
        try {
          const connection = await new Promise<NativePipeConnection>(
            (resolve, reject) => {
              let expired = false;
              const timeout = setTimeout(() => {
                expired = true;
                reject(
                  new Error("Computer Use native pipe connection timed out"),
                );
              }, this.#timeout ?? 10000);
              try {
                Reflect.apply(intrinsicThen, this.#create(this.#path), [
                  (connection: NativePipeConnection) => {
                    clearTimeout(timeout);
                    if (expired) connection.end();
                    else resolve(connection);
                  },
                  (error: unknown) => {
                    clearTimeout(timeout);
                    reject(error);
                  },
                ]);
              } catch (error) {
                clearTimeout(timeout);
                reject(error);
              }
            },
          );
          if (this.#closed) {
            connection.end();
            throw new Error("Computer Use native pipe is closed");
          }
          this.#active = connection;
          connection.on("data", (chunk: Uint8Array) => {
            if (this.#active === connection)
              try {
                this.#receive(connection, chunk);
              } catch (error) {
                this.#reset(
                  connection,
                  error instanceof Error ? error : new Error(String(error)),
                );
                connection.end();
              }
          });
          connection.on("error", (error: Error) =>
            this.#reset(connection, error),
          );
          connection.on("close", () =>
            this.#reset(
              connection,
              new Error("Computer Use native pipe closed before response"),
            ),
          );
          return connection;
        } catch (error) {
          if (this.#connection === attempt) this.#connection = null;
          throw new Error(
            `Computer Use native pipe is unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      })();
      this.#connection = attempt;
    }
    return this.#connection;
  }
  #send(
    connection: NativePipeConnection,
    rpcMethod: string,
    params: unknown,
    method: string,
    elicit: Elicit | undefined,
  ) {
    const id = this.#nextId++,
      timeoutMs = this.#timeout ?? (method === "launch_app" ? 15000 : 10000);
    return new Promise<unknown>((resolve, reject) => {
      const pending: Pending = {
        createElicitation: elicit,
        method,
        reject,
        resolve,
        timeout: setTimeout(() => this.#expire(connection, id), timeoutMs),
        timeoutMs,
      };
      this.#pending.set(id, pending);
      try {
        this.#write(connection, {
          id,
          jsonrpc: "2.0",
          method: rpcMethod,
          params,
        });
      } catch (error) {
        clearTimeout(pending.timeout);
        this.#pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  #expire(connection: NativePipeConnection, id: number) {
    const pending = this.#pending.get(id);
    if (pending != null && this.#active === connection) {
      this.#reset(
        connection,
        new Error("computer-use request timed out: " + pending.method),
      );
      connection.end();
    }
  }
  #write(connection: NativePipeConnection, message: unknown) {
    const bytes = Buffer.from(JSON.stringify(message), "utf8");
    if (bytes.length > 8388608)
      throw new Error(
        `Computer Use native pipe frame is too large: ${bytes.length}`,
      );
    const frame = Buffer.alloc(4 + bytes.length);
    frame.writeUInt32LE(bytes.length, 0);
    bytes.copy(frame, 4);
    connection.write(frame);
  }
  #receive(connection: NativePipeConnection, chunk: Uint8Array) {
    this.#chunks.push(Buffer.from(chunk));
    this.#size += chunk.length;
    while (this.#size >= 4) {
      const first = this.#chunks[0],
        length = (
          first != null && first.length >= 4
            ? first
            : Buffer.concat(this.#chunks, 4)
        ).readUInt32LE(0);
      if (length > 67108864)
        throw new Error(
          `Computer Use native pipe frame is too large: ${length}`,
        );
      const end = 4 + length;
      if (this.#size < end) return;
      const bytes = Buffer.concat(this.#chunks, this.#size),
        message = JSON.parse(bytes.subarray(4, end).toString()),
        remaining = bytes.subarray(end);
      this.#chunks = remaining.length === 0 ? [] : [remaining];
      this.#size = remaining.length;
      this.#dispatch(connection, message);
    }
  }
  #dispatch(connection: NativePipeConnection, message: any) {
    if (
      message.method === "requestComputerUseApproval" &&
      typeof message.id === "string"
    ) {
      void this.#approval(connection, message.id, message.params);
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.#pending.get(message.id);
    if (pending != null) {
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error == null) pending.resolve(message.result);
      else pending.reject(new Error(message.error.message));
    }
  }
  async #approval(
    connection: NativePipeConnection,
    id: string,
    params: unknown,
  ) {
    for (const pending of this.#pending.values()) clearTimeout(pending.timeout);
    try {
      const elicit = this.#pending.values().next().value?.createElicitation;
      if (typeof elicit !== "function")
        throw new Error(
          "Computer Use app approval UI is unavailable outside trusted node_repl",
        );
      const result = await elicit(params);
      if (this.#active === connection)
        this.#write(connection, { id, jsonrpc: "2.0", result });
    } catch (error) {
      if (this.#active === connection)
        this.#write(connection, {
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
          id,
          jsonrpc: "2.0",
        });
    } finally {
      if (this.#active === connection)
        for (const [id, pending] of this.#pending)
          pending.timeout = setTimeout(
            () => this.#expire(connection, id),
            pending.timeoutMs,
          );
    }
  }
  #reset(connection: NativePipeConnection, error: Error) {
    if (this.#active === connection) {
      this.#active = null;
      this.#connection = null;
      this.#size = 0;
      this.#chunks = [];
      this.#rejectAll(error);
    }
  }
  #rejectAll(error: Error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
