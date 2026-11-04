import { TunnelMcpServer, isTunnelObject } from "./tunnel_mcp_server";
import {
  TunnelElicitationClient,
  type TunnelCommand,
} from "./tunnel_elicitation_client";
import {
  createTunnelResponseDelivery,
  tunnelRetryAfter,
  type TunnelDeliveryEnvironment,
  type TunnelNetworkRequest,
  type TunnelUnauthorizedRecovery,
} from "./tunnel_response_delivery";
export interface HttpTunnelCommand extends TunnelCommand {
  command_type?: string;
  shard_token?: string;
  response_timeout?: unknown;
  request_id: string;
}
export interface TunnelHttpEnvironment extends TunnelDeliveryEnvironment {
  version(): string;
  online(): boolean | undefined;
  randomUUID(): string;
  warn(message: string, detail?: unknown): void;
  reportPollingState(state: string, reason?: string, status?: number): void;
  reportResponseFailure(
    reason: string,
    responseType: unknown,
    status?: number,
  ): void;
}
/** Original h_. The deadline starts when the poll response arrives. */
export function tunnelCommandDeadline(
  command: { response_timeout?: unknown },
  receivedAt: number,
) {
  if (typeof command.response_timeout !== "string") return null;
  const match = /^(\d+)(ns|us|ms|s|m|h)$/u.exec(command.response_timeout);
  if (match == null) return null;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value)) return null;
  const multiplier = (
    { h: 3600000, m: 60000, ms: 1, ns: 0.000001, s: 1000, us: 0.001 } as Record<
      string,
      number
    >
  )[match[2]!];
  if (multiplier == null) return null;
  const duration = value * multiplier;
  return Number.isFinite(duration) ? receivedAt + duration : null;
}
/** Original d_. Network callbacks use actual restored delivery and elicitation
 * implementations; environment supplies browser clocks/fetch and telemetry. */
export class TunnelHttpServer extends TunnelMcpServer {
  readonly activeClients = new Set<TunnelElicitationClient>();
  readonly networkRequests = new Set<TunnelNetworkRequest>();
  readonly pollUrl: string;
  readonly responseUrl: string;
  controller: AbortController | null = null;
  listening = true;
  pendingCommands = 0;
  invalidTunnelResponses = 0;
  pollRetryAfterMs = 0;
  private readonly delivery: ReturnType<typeof createTunnelResponseDelivery>;
  constructor(
    readonly config: { tunnelId: string; baseUrl: string; apiKey: string },
    serverInfo: unknown,
    readonly env: TunnelHttpEnvironment,
    readonly onPollingFailure?: (
      reason: "unauthorized" | "invalid_tunnel",
    ) => Promise<unknown>,
    readonly onResponseUnauthorized?: TunnelUnauthorizedRecovery,
  ) {
    super(serverInfo, () => env.randomUUID());
    this.delivery = createTunnelResponseDelivery(env);
    const path = `/v1/tunnels/${encodeURIComponent(config.tunnelId)}`;
    this.pollUrl = new URL(`${path}/poll`, config.baseUrl).toString();
    this.responseUrl = new URL(`${path}/response`, config.baseUrl).toString();
  }
  async initialize() {
    if (this.controller != null || !this.listening) return;
    const controller = new AbortController();
    this.controller = controller;
    let finished = false;
    this.run(controller.signal)
      .then(() => {
        finished = true;
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          this.env.reportPollingState("stopped", "unknown");
          this.env.warn(
            "[tunnel-mcp-server] tunnel polling stopped unexpectedly",
          );
        }
      })
      .finally(() => {
        if (this.controller === controller) {
          this.controller = null;
          if (finished && this.listening && !controller.signal.aborted)
            this.initialize();
        }
      });
  }
  setListening(listening: boolean) {
    this.listening = listening;
  }
  async ensurePolling() {
    for (const request of this.networkRequests) request.expireIfOverdue();
    await this.initialize();
  }
  dispose() {
    this.controller?.abort();
    this.controller = null;
    for (const client of this.activeClients)
      client.cancel(new Error("MCP tunnel was disposed"));
  }
  async run(signal: AbortSignal, executionSignal = signal) {
    let backoff = 1000;
    while (!signal.aborted && (this.listening || this.pendingCommands > 0)) {
      let outcome;
      try {
        outcome = await this.pollOnce(signal, executionSignal);
      } catch (error) {
        if (signal.aborted) return;
        this.env.warn("[tunnel-mcp-server] tunnel poll failed", error);
        outcome = "retry";
      }
      if (outcome === "ok") {
        backoff = 1000;
        continue;
      }
      const jitter = Math.floor(this.env.random() * backoff);
      await this.delivery.wait(
        Math.max(backoff + jitter, this.pollRetryAfterMs),
        signal,
      );
      backoff = Math.min(backoff * 2, 10000);
    }
  }
  async pollOnce(
    signal: AbortSignal,
    executionSignal = signal,
  ): Promise<"ok" | "retry"> {
    this.pollRetryAfterMs = 0;
    const now = this.env.now();
    const request = this.delivery.createRequest(signal, now + 25000, now);
    if (request == null) return "ok";
    this.networkRequests.add(request);
    let body: any, receivedAt: number;
    try {
      let response: Response;
      try {
        response = await this.env.fetch(
          `${this.pollUrl}?limit=1&timeout_ms=15000`,
          {
            credentials: "omit",
            headers: this.headers(),
            method: "GET",
            signal: request.signal,
          },
        );
      } catch (error) {
        if (signal.aborted) return "ok";
        if (this.env.online() === false) this.env.reportPollingState("offline");
        else this.env.reportPollingState("failed", "network");
        this.env.warn("[tunnel-mcp-server] tunnel poll failed", error);
        return "retry";
      }
      receivedAt = this.env.now();
      if (response.status !== 404 && response.status !== 410)
        this.invalidTunnelResponses = 0;
      if (response.status === 204) {
        this.env.reportPollingState("connected");
        return "ok";
      }
      if (!response.ok) {
        this.env.reportPollingState("failed", "http", response.status);
        this.env.warn("[tunnel-mcp-server] tunnel poll failed", {
          status: response.status,
          statusText: response.statusText,
        });
        this.pollRetryAfterMs = tunnelRetryAfter(response, this.env.wallNow());
        if (response.status === 401)
          await this.onPollingFailure?.("unauthorized");
        if (
          (response.status === 404 || response.status === 410) &&
          ++this.invalidTunnelResponses >= 3
        ) {
          await this.onPollingFailure?.("invalid_tunnel");
          this.invalidTunnelResponses = 0;
        }
        return "retry";
      }
      try {
        body = await response.json();
      } catch (error) {
        if (!signal.aborted)
          this.env.reportPollingState("failed", "invalid_response");
        this.env.warn(
          "[tunnel-mcp-server] tunnel poll returned invalid JSON",
          error,
        );
        return "retry";
      }
    } finally {
      this.networkRequests.delete(request);
      request.dispose();
    }
    if (!isTunnelObject(body) || !Array.isArray(body.commands)) {
      this.env.reportPollingState("failed", "invalid_response");
      this.env.warn("[tunnel-mcp-server] tunnel poll returned no commands");
      return "retry";
    }
    this.env.reportPollingState("connected");
    for (const command of body.commands) {
      if (signal.aborted) return "ok";
      if (command == null || !command.request_id) continue;
      const deferred = this.shouldDeferCommand(command);
      this.pendingCommands++;
      const operation = this.handleCommand(
        command,
        receivedAt,
        deferred ? executionSignal : signal,
        executionSignal,
      ).finally(() => {
        this.pendingCommands--;
      });
      if (deferred)
        operation.catch(() => {
          if (!signal.aborted)
            this.env.warn("[tunnel-mcp-server] deferred request failed");
        });
      else await operation;
    }
    return "ok";
  }
  async handleCommand(
    command: HttpTunnelCommand,
    receivedAt: number,
    signal: AbortSignal,
    executionSignal: AbortSignal,
  ) {
    const deadline = tunnelCommandDeadline(command, receivedAt);
    const now = this.env.now();
    if (deadline != null && deadline <= now) return;
    const request = this.delivery.createRequest(
      signal,
      deadline ?? now + 30000,
      now,
    );
    if (request == null) return;
    let response,
      terminated = false;
    try {
      if (command.command_type === "session_termination")
        terminated = await this.onSessionTerminated(command);
      response = await this.getMcpResponse(
        command,
        deadline,
        request.signal,
        executionSignal,
      );
    } finally {
      request.dispose();
    }
    if (request.signal.aborted || response == null) return;
    const delivered = await this.delivery.postResponse(
      this.responseUrl,
      this.headers(command.shard_token),
      response,
      deadline,
      signal,
      this.networkRequests,
      this.onResponseUnauthorized,
      this.env.reportResponseFailure,
    );
    if (terminated && delivered)
      for (const client of this.activeClients) client.terminateSession(command);
    else if (command.jsonrpc != null && !("method" in command.jsonrpc)) {
      for (const client of this.activeClients)
        if (client.handleResponse(command, delivered)) break;
    } else if (delivered)
      for (const client of this.activeClients) client.cancelRequest(command);
  }
  onSessionTerminated(_command: HttpTunnelCommand): Promise<boolean> {
    return Promise.resolve(true);
  }
  shouldDeferCommand(_command: HttpTunnelCommand) {
    return false;
  }
  async getMcpResponse(
    command: HttpTunnelCommand,
    deadline: number | null,
    signal: AbortSignal,
    executionSignal: AbortSignal,
  ) {
    if (command.command_type === "session_termination")
      return {
        channel: command.channel,
        request_id: command.request_id,
        resp_code: 204,
        resp_type: "session_termination_response",
      };
    if (command.command_type !== "jsonrpc" || command.jsonrpc == null) {
      this.env.warn("[tunnel-mcp-server] unsupported tunnel command", {
        commandType: command.command_type,
        requestId: command.request_id,
      });
      return null;
    }
    if (!("method" in command.jsonrpc) || !("id" in command.jsonrpc))
      return {
        channel: command.channel,
        request_id: command.request_id,
        resp_code: 202,
        resp_type: "notify_ack",
      };
    const { id, method, params } = command.jsonrpc;
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const client = new TunnelElicitationClient(
      command,
      (response, abort) =>
        this.delivery.postResponse(
          this.responseUrl,
          this.headers(command.shard_token),
          response,
          deadline,
          abort,
          this.networkRequests,
          this.onResponseUnauthorized,
          this.env.reportResponseFailure,
        ),
      async (abort) => {
        if (!this.shouldDeferCommand(command))
          await this.run(abort, executionSignal);
      },
      (reason) => controller.abort(reason),
      () => this.env.randomUUID(),
    );
    this.activeClients.add(client);
    try {
      const result: any = await this.callMethod(
        method,
        params,
        client,
        combined,
        { channel: command.channel ?? "main", requestId: command.request_id },
      );
      if (result == null) return null;
      const { headers, ...body } = result;
      return {
        channel: command.channel,
        request_id: command.request_id,
        resp_code: 200,
        resp_headers: { "Content-Type": ["application/json"], ...headers },
        resp_json: { id, jsonrpc: "2.0", ...body },
        resp_type: "jsonrpc_response",
      };
    } finally {
      this.activeClients.delete(client);
      client.dispose();
    }
  }
  headers(shardToken?: string) {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "X-Tunnel-Client-Name": "codex-chrome-mcp-server",
      "X-Tunnel-Client-Version": this.env.version(),
      ...(shardToken == null ? {} : { "X-Tunnel-Shard-Token": shardToken }),
    };
  }
}
