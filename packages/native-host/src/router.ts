/** Independently authored native host routing; wire messages match BrowserRpcPeer.
 * This is not a translation of the installed Rust host and does not impersonate it.
 */
export type RpcMessage = Record<string, unknown>;
export function rpcMessage(value: unknown): RpcMessage {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid RPC message");
  const message = value as RpcMessage;
  if (message.jsonrpc !== "2.0") throw Error("Expected JSON-RPC 2.0");
  if (
    "id" in message &&
    typeof message.id !== "string" &&
    typeof message.id !== "number"
  )
    throw Error("Invalid RPC id");
  if ("method" in message && typeof message.method !== "string")
    throw Error("Invalid RPC method");
  return message;
}
export class NativeHostRouter {
  private nextId = 0;
  private clients = new Map<string, (message: RpcMessage) => void>();
  private pending = new Map<
    string,
    { client: string; id: unknown; timer: ReturnType<typeof setTimeout> }
  >();
  private reverse = new Map<
    string,
    { id: unknown; waiting: Set<string>; timer: ReturnType<typeof setTimeout> }
  >();
  private finishReverse(id: string, response: RpcMessage) {
    const pending = this.reverse.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.reverse.delete(id);
    this.sendExtension({ ...response, jsonrpc: "2.0", id: pending.id });
  }
  constructor(
    private sendExtension: (message: RpcMessage) => void,
    private timeoutMs = 30_000,
    private maxPending = 1024,
  ) {}
  addClient(id: string, send: (message: RpcMessage) => void) {
    if (this.clients.has(id)) throw Error("Duplicate client");
    this.clients.set(id, send);
  }
  removeClient(id: string) {
    this.clients.delete(id);
    for (const [key, pending] of this.reverse) {
      pending.waiting.delete(id);
      if (pending.waiting.size === 0)
        this.finishReverse(key, {
          error: { code: -32000, message: "No connected browser client" },
        });
    }
    for (const [key, value] of this.pending)
      if (value.client === id) {
        clearTimeout(value.timer);
        this.pending.delete(key);
      }
  }
  fromClient(client: string, value: unknown) {
    if (!this.clients.has(client)) throw Error("Unknown client");
    const message = rpcMessage(value);
    if (typeof message.method !== "string") {
      const pending =
        typeof message.id === "string"
          ? this.reverse.get(message.id)
          : undefined;
      if (!pending || !pending.waiting.has(client)) return;
      if (!("result" in message) && !("error" in message))
        throw Error("Invalid client response");
      pending.waiting.delete(client);
      if ("result" in message || pending.waiting.size === 0)
        this.finishReverse(message.id as string, message);
      return;
    }
    if (!("id" in message)) {
      this.sendExtension(message);
      return;
    }
    if (this.pending.size >= this.maxPending)
      throw Error("Native host request capacity exceeded");
    const id = `core-native:${++this.nextId}`;
    const timer = setTimeout(() => {
      const pending = this.pending.get(id);
      this.pending.delete(id);
      if (pending)
        this.clients.get(client)?.({
          jsonrpc: "2.0",
          id: pending.id,
          error: { code: -32000, message: "Extension response timed out" },
        });
    }, this.timeoutMs);
    timer.unref();
    this.pending.set(id, { client, id: message.id, timer });
    try {
      this.sendExtension({ ...message, id });
    } catch (error) {
      clearTimeout(timer);
      this.pending.delete(id);
      throw error;
    }
  }
  fromExtension(value: unknown) {
    const message = rpcMessage(value);
    if ("method" in message) {
      if ("id" in message) {
        if (message.method === "ping") {
          if (this.clients.size === 0) {
            this.sendExtension({
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32000, message: "No connected browser client" },
            });
            return;
          }
          if (this.reverse.size >= this.maxPending)
            throw Error("Native host reverse request capacity exceeded");
          const id = `core-client:${++this.nextId}`;
          const timer = setTimeout(
            () =>
              this.finishReverse(id, {
                error: {
                  code: -32000,
                  message: "Browser client response timed out",
                },
              }),
            this.timeoutMs,
          );
          timer.unref();
          this.reverse.set(id, {
            id: message.id,
            waiting: new Set(this.clients.keys()),
            timer,
          });
          for (const send of this.clients.values()) send({ ...message, id });
          return;
        }
        this.sendExtension({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: "Native host method not implemented",
          },
        });
      } else for (const send of this.clients.values()) send(message);
      return;
    }
    if (typeof message.id !== "string") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (!("result" in message) && !("error" in message))
      throw Error("Invalid extension response");
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    this.clients.get(pending.client)?.({ ...message, id: pending.id });
  }
  close() {
    for (const pending of this.reverse.values()) clearTimeout(pending.timer);
    this.reverse.clear();
    for (const id of this.clients.keys()) this.removeClient(id);
  }
}
