export interface TunnelCommand {
  channel?: string | null;
  request_id?: string;
  headers?: Record<string, any> | null;
  jsonrpc?: any;
}
export interface TunnelElicitationResult {
  action: "accept" | "cancel" | "decline";
  [key: string]: unknown;
}
/** Original Rl and n_; preserve duplicate header and inherited-action behavior. */
export function tunnelSessionHeaders(
  command: TunnelCommand,
): any[] | undefined {
  const entries = Object.entries(command.headers ?? {}).filter(
    ([key]) => key.toLowerCase() === "mcp-session-id",
  );
  return entries.length === 0
    ? undefined
    : entries.flatMap(([, value]) => value);
}
export function isTunnelElicitationResult(
  value: any,
): value is TunnelElicitationResult {
  return (
    typeof value === "object" &&
    value != null &&
    "action" in value &&
    (value.action === "accept" ||
      value.action === "cancel" ||
      value.action === "decline")
  );
}
interface PendingElicitation {
  controller: AbortController;
  onAbort(): void;
  reject(error: unknown): void;
  resolve(value: TunnelElicitationResult): void;
  signal: AbortSignal;
}
/** Original r_: per-command MCP client. HTTP delivery and polling are supplied
 * by the tunnel transport. No acceptance is inferred from delivery success. */
export class TunnelElicitationClient {
  readonly pendingElicitations = new Map<string, PendingElicitation>();
  disposed = false;
  constructor(
    readonly command: TunnelCommand,
    private readonly postResponse: (
      response: Record<string, unknown>,
      signal: AbortSignal,
    ) => Promise<boolean>,
    private readonly poll: (signal: AbortSignal) => Promise<unknown>,
    private readonly abortExecution: (reason: unknown) => void,
    private readonly randomUUID: () => string = () => crypto.randomUUID(),
  ) {}
  createElicitation(
    request: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<TunnelElicitationResult> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.disposed)
      return Promise.reject(new Error("MCP tool call has finished"));
    const id = this.randomUUID();
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const onAbort = () => this.rejectElicitation(id, signal.reason);
      const pending = { controller, onAbort, reject, resolve, signal };
      this.pendingElicitations.set(id, pending);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      this.postResponse(
        {
          channel: this.command.channel,
          request_id: this.command.request_id,
          resp_code: 200,
          resp_headers: { "Content-Type": ["application/json"] },
          resp_json: {
            id,
            jsonrpc: "2.0",
            method: "elicitation/create",
            params: { mode: "form", ...request },
          },
          resp_type: "jsonrpc_notify",
        },
        signal,
      ).then(
        (delivered) => {
          if (this.pendingElicitations.get(id) === pending) {
            if (!delivered) {
              this.rejectElicitation(
                id,
                new Error("MCP elicitation could not be delivered"),
              );
              return;
            }
            this.poll(controller.signal).catch((error) => {
              if (!controller.signal.aborted) this.rejectElicitation(id, error);
            });
          }
        },
        (error) => this.rejectElicitation(id, error),
      );
    });
  }
  handleResponse(command: TunnelCommand, acknowledged: boolean) {
    const rpc = command.jsonrpc;
    if (
      rpc == null ||
      "method" in rpc ||
      typeof rpc.id !== "string" ||
      !this.matchesSession(command) ||
      this.pendingElicitations.get(rpc.id) == null
    )
      return false;
    if (!acknowledged)
      this.rejectElicitation(
        rpc.id,
        new Error("MCP elicitation response could not be acknowledged"),
      );
    else if ("error" in rpc)
      this.rejectElicitation(rpc.id, new Error(rpc.error.message));
    else if (isTunnelElicitationResult(rpc.result))
      this.takeElicitation(rpc.id)?.resolve(rpc.result);
    else
      this.rejectElicitation(
        rpc.id,
        new Error("MCP client returned an invalid elicitation response"),
      );
    return true;
  }
  terminateSession(command: TunnelCommand) {
    if (this.matchesSession(command))
      this.cancel(new Error("MCP session was terminated"));
  }
  cancelRequest(command: TunnelCommand) {
    const rpc = command.jsonrpc;
    const original = this.command.jsonrpc;
    if (
      rpc == null ||
      !("method" in rpc) ||
      rpc.method !== "notifications/cancelled" ||
      "id" in rpc ||
      original == null ||
      !("method" in original) ||
      original.method !== "tools/call" ||
      original.id == null ||
      !this.matchesSession(command)
    )
      return;
    const params = rpc.params;
    if (
      typeof params === "object" &&
      params != null &&
      "requestId" in params &&
      params.requestId === original.id
    )
      this.cancel(new Error("MCP tool call was cancelled"));
  }
  cancel(reason: unknown) {
    if (!this.disposed) {
      this.abortExecution(reason);
      this.dispose(reason);
    }
  }
  dispose(reason: unknown = new Error("MCP tool call has finished")) {
    if (!this.disposed) {
      this.disposed = true;
      for (const id of this.pendingElicitations.keys())
        this.rejectElicitation(id, reason);
    }
  }
  rejectElicitation(id: string, reason: unknown) {
    this.takeElicitation(id)?.reject(reason);
  }
  matchesSession(command: TunnelCommand) {
    if ((this.command.channel ?? "main") !== (command.channel ?? "main"))
      return false;
    const own = tunnelSessionHeaders(this.command);
    const incoming = tunnelSessionHeaders(command);
    return own == null
      ? incoming == null
      : own.length === 1 &&
          typeof own[0] === "string" &&
          own[0] !== "" &&
          incoming?.length === 1 &&
          incoming[0] === own[0];
  }
  takeElicitation(id: string) {
    const pending = this.pendingElicitations.get(id);
    if (pending == null) return null;
    this.pendingElicitations.delete(id);
    pending.signal.removeEventListener("abort", pending.onAbort);
    pending.controller.abort();
    return pending;
  }
}
