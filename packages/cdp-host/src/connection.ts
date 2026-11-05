/** Independent CDP transport. Browser/CUA policy stays in the restored service. */
export interface CdpEvent {
  method: string;
  params: Record<string, any>;
  sessionId?: string;
}
type Pending = {
  resolve(value: any): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};
export class CdpConnection {
  private sequence = 0;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(event: CdpEvent) => void>();
  private closed = false;
  private constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (typeof message.id === "number") {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          if (message.error)
            pending.reject(
              Error(`CDP ${message.error.code}: ${message.error.message}`),
            );
          else pending.resolve(message.result ?? {});
        } else if (typeof message.method === "string") {
          for (const listener of this.listeners) listener(message);
        }
      } catch (error) {
        this.fail(error instanceof Error ? error : Error(String(error)));
        this.socket.close();
      }
    });
    socket.addEventListener("close", () =>
      this.fail(Error("CDP connection closed")),
    );
    socket.addEventListener("error", () =>
      this.fail(Error("CDP connection failed")),
    );
  }
  static async connect(endpoint: string, timeoutMs = 10000) {
    const url = new URL(endpoint);
    if (
      url.protocol !== "ws:" ||
      !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw Error(
        "CDP requires an explicit loopback ws endpoint without credentials",
      );
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.close();
        reject(Error("CDP connection timed out"));
      }, timeoutMs);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(Error("Could not connect to local CDP endpoint"));
        },
        { once: true },
      );
    });
    return new CdpConnection(socket);
  }
  onEvent(listener: (event: CdpEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  send<T = any>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 15000,
  ): Promise<T> {
    if (this.closed) return Promise.reject(Error("CDP connection closed"));
    if (this.pending.size >= 1024)
      return Promise.reject(Error("CDP request capacity exceeded"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(`CDP ${method} timed out; action outcome may be unknown`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(
          JSON.stringify({
            id,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          }),
        );
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private fail(error: Error) {
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
  close() {
    this.fail(Error("CDP connection closed"));
    this.listeners.clear();
    this.socket.close();
  }
}
