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
    for (const [key, value] of this.pending)
      if (value.client === id) {
        clearTimeout(value.timer);
        this.pending.delete(key);
      }
  }
  fromClient(client: string, value: unknown) {
    if (!this.clients.has(client)) throw Error("Unknown client");
    const message = rpcMessage(value);
    if (typeof message.method !== "string")
      throw Error("Client must send a request or notification");
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
    for (const id of this.clients.keys()) this.removeClient(id);
  }
}
