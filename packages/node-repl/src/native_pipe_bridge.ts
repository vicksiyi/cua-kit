import { Buffer } from "node:buffer";
import { toByteArray } from "./worker_values";
import type { createWorkerRuntime, ExecState } from "./worker_runtime";
type Listener = (...args: any[]) => unknown;
type Connection = {
  execState: ExecState;
  listeners: Record<"data" | "close" | "error", Set<Listener>>;
  closed: boolean;
  error: Error | null;
};
type Options = Pick<
  ReturnType<typeof createWorkerRuntime>,
  "execContext" | "send"
>;
export function createNativePipeBridge({ execContext, send }: Options) {
  const pendingRequests = new Map<string, (message: any) => void>();
  const connections = new Map<string, Connection>();
  // A peer may close before its connect response resumes in JavaScript.
  const pendingClosures = new Map<string, Error | null>();
  let requestCounter = 0;

  function request(op: string, payload: Record<string, unknown> = {}) {
    const id = `native-pipe-${requestCounter++}`;
    send({
      type: "native_pipe_request",
      id,
      op,
      ...payload,
    });
    return new Promise<any>((resolve, reject) => {
      pendingRequests.set(id, (message) => {
        if (!message.ok) {
          reject(new Error(message.error || "native pipe request failed"));
          return;
        }
        resolve(message.result);
      });
    });
  }

  function queueListener(listener: Listener, ...args: unknown[]) {
    void Promise.resolve()
      .then(() => listener(...args))
      .catch(() => {});
  }

  function closeConnection(connection: Connection, error: Error | null) {
    if (connection.closed) {
      return;
    }
    connection.closed = true;
    connection.error = error;
    execContext.run(connection.execState, () => {
      if (error) {
        for (const listener of connection.listeners.error) {
          queueListener(listener, error);
        }
      }
      for (const listener of connection.listeners.close) {
        queueListener(listener as Listener);
      }
    });
  }

  const nativePipe = Object.freeze({
    async createConnection(pipePath: unknown) {
      if (typeof pipePath !== "string" || pipePath.length === 0) {
        throw new Error("native pipe path must be a non-empty string");
      }
      const result = await request("connect", { path: pipePath });
      const connectionId =
        result &&
        typeof result === "object" &&
        typeof result.connection_id === "string"
          ? result.connection_id
          : null;
      if (!connectionId) {
        throw new Error(
          "native pipe connect returned an invalid connection id",
        );
      }
      const connection: Connection = {
        execState: execContext.getAsync(),
        listeners: { data: new Set(), close: new Set(), error: new Set() },
        closed: pendingClosures.has(connectionId),
        error: pendingClosures.get(connectionId) ?? null,
      };
      pendingClosures.delete(connectionId);
      if (!connection.closed) {
        connections.set(connectionId, connection);
      }
      return Object.freeze({
        write(data: unknown) {
          if (connection.closed) {
            return;
          }
          const current = execContext.getOptional();
          if (current != null) {
            connection.execState = current;
          }
          const bytes = toByteArray(data);
          if (!bytes) {
            throw new Error("native pipe write expected bytes");
          }
          void request("write", {
            connection_id: connectionId,
            data_base64: Buffer.from(bytes).toString("base64"),
          }).catch((error) => {
            // Either a rejected write or a close event is terminal.
            closeConnection(
              connection,
              error instanceof Error ? error : new Error(String(error)),
            );
          });
        },
        on(event: unknown, listener: unknown) {
          if (event !== "data" && event !== "close" && event !== "error") {
            throw new Error(`unsupported native pipe event: ${String(event)}`);
          }
          if (typeof listener !== "function") {
            throw new Error("native pipe event listener must be a function");
          }
          if (connection.listeners[event].has(listener as Listener)) {
            return;
          }
          connection.listeners[event].add(listener as Listener);
          // Terminal events remain observable to listeners attached late.
          if (event === "error" && connection.error) {
            queueListener(listener as Listener, connection.error);
          }
          if (event === "close" && connection.closed) {
            queueListener(listener as Listener);
          }
        },
        off(event: unknown, listener: Listener) {
          if (event !== "data" && event !== "close" && event !== "error") {
            throw new Error(`unsupported native pipe event: ${String(event)}`);
          }
          connection.listeners[event].delete(listener);
        },
        end() {
          void request("close", { connection_id: connectionId }).catch(
            () => {},
          );
        },
      });
    },
  });

  function handleMessage(message: any) {
    if (message.type === "native_pipe_response") {
      const resolver = pendingRequests.get(message.id);
      if (resolver) {
        pendingRequests.delete(message.id);
        resolver(message);
      }
      return true;
    }
    if (message.type === "native_pipe_data") {
      const connection = connections.get(message.connection_id);
      if (connection) {
        const data = Buffer.from(message.data_base64, "base64");
        execContext.run(connection.execState, () => {
          for (const listener of connection.listeners.data) {
            listener(data);
          }
        });
      }
      return true;
    }
    if (message.type === "native_pipe_closed") {
      const connection = connections.get(message.connection_id);
      const error = message.error ? new Error(message.error) : null;
      if (!connection) {
        pendingClosures.set(message.connection_id, error);
      } else {
        connections.delete(message.connection_id);
        closeConnection(connection, error);
      }
      return true;
    }
    return false;
  }

  return { handleMessage, nativePipe };
}
