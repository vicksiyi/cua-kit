/** Independent Unix-domain transport; endpoint authorization is explicitly supplied by the host. */
import { createConnection, type Socket } from "node:net";
import { isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import type { Message } from "./session";
export interface NativePipeHost {
  request(message: Readonly<Message>): Promise<unknown>;
  close(): Promise<void>;
}
export class UnixNativePipeHost implements NativePipeHost {
  private connections = new Map<
    string,
    { socket: Socket; closed: Promise<void> }
  >();
  private ended = false;
  private allowed: Set<string>;
  constructor(
    paths: readonly string[],
    private emit: (message: Message) => void,
  ) {
    if (process.platform === "win32")
      throw Error("Unix native pipes require POSIX");
    if (paths.some((path) => typeof path !== "string" || !isAbsolute(path)))
      throw Error("Native pipe allowlist requires absolute paths");
    this.allowed = new Set(paths);
  }
  async request(message: Readonly<Message>): Promise<unknown> {
    if (this.ended) throw Error("Native pipe host is closed");
    if (message.op === "connect") {
      if (!this.allowed.has(message.path))
        throw Error("Native pipe endpoint is not authorized");
      if (this.connections.size >= 64)
        throw Error("Native pipe connection limit exceeded");
      const id = randomUUID();
      const socket = createConnection({ path: message.path });
      let error: string | undefined;
      let established = false;
      const closed = new Promise<void>((resolve) =>
        socket.once("close", () => {
          this.connections.delete(id);
          if (!this.ended && established)
            this.emit({
              type: "native_pipe_closed",
              connection_id: id,
              ...(error ? { error } : {}),
            });
          resolve();
        }),
      );
      this.connections.set(id, { socket, closed });
      socket.on("error", (failure) => {
        error = failure.message;
      });
      socket.on("data", (chunk) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (this.ended) return;
        // Bound individual JSONL frames while preserving byte order.
        for (let offset = 0; offset < data.length; offset += 65536)
          this.emit({
            type: "native_pipe_data",
            connection_id: id,
            data_base64: data
              .subarray(offset, offset + 65536)
              .toString("base64"),
          });
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.destroy(Error("Native pipe connect timed out"));
          }, 5000);
          const connected = () => {
            cleanup();
            resolve();
          };
          const failed = (failure: Error) => {
            cleanup();
            reject(failure);
          };
          const stopped = () => {
            cleanup();
            reject(Error("Native pipe closed before connection"));
          };
          const cleanup = () => {
            clearTimeout(timeout);
            socket.off("connect", connected);
            socket.off("error", failed);
            socket.off("close", stopped);
          };
          socket.once("connect", connected);
          socket.once("error", failed);
          socket.once("close", stopped);
        });
        if (this.ended)
          throw Error("Native pipe host closed during connection");
        if (socket.destroyed)
          throw Error("Native pipe closed during connection");
        established = true;
        return { connection_id: id };
      } catch (failure) {
        socket.destroy();
        await closed;
        throw failure;
      }
    }
    const connection = this.connections.get(message.connection_id);
    if (!connection) throw Error("Unknown native pipe connection");
    if (message.op === "close") {
      connection.socket.destroy();
      await connection.closed;
      return null;
    }
    if (message.op !== "write")
      throw Error("Unsupported native pipe operation");
    const value = message.data_base64;
    if (
      typeof value !== "string" ||
      value.length > 349528 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        value,
      )
    )
      throw Error("Invalid or oversized native pipe write");
    const bytes = Buffer.from(value, "base64");
    if (bytes.length > 262144)
      throw Error("Invalid or oversized native pipe write");
    if (connection.socket.writableLength + bytes.length > 1048576) {
      connection.socket.destroy(
        Error("Native pipe write queue limit exceeded"),
      );
      throw Error("Native pipe write queue limit exceeded");
    }
    await new Promise<void>((resolve, reject) =>
      connection.socket.write(bytes, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    return null;
  }
  async close() {
    this.ended = true;
    const connections = [...this.connections.values()];
    for (const connection of connections) connection.socket.destroy();
    await Promise.all(connections.map((connection) => connection.closed));
  }
}
