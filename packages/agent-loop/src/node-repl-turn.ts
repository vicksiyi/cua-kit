/** Independently authored host lifecycle adapter for the observed NodeREPL protocol. */
import type { ToolClient, ToolCall, ToolResult } from "./contracts";
export interface NodeReplTurnEvent {
  hook_event_name: string;
  session_id: string;
  turn_id: string;
}
export function parseNodeReplTurnEvent(value: unknown): NodeReplTurnEvent {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("NodeREPL turn event must be an object");
  const event = value as Record<string, unknown>;
  const keys = ["hook_event_name", "session_id", "turn_id"] as const;
  if (
    Object.keys(event).some(
      (key) => !keys.includes(key as (typeof keys)[number]),
    ) ||
    keys.some(
      (key) => typeof event[key] !== "string" || event[key].length === 0,
    )
  )
    throw new Error(
      "NodeREPL turn event requires only nonempty hook_event_name, session_id and turn_id",
    );
  return Object.fromEntries(
    keys.map((key) => [key, event[key]]),
  ) as unknown as NodeReplTurnEvent;
}
/** One adapter per turn; the underlying MCP connection may live across turns. */
export class NodeReplTurnClient implements ToolClient {
  private readonly event: NodeReplTurnEvent;
  private ending?: Promise<void>;
  constructor(
    private client: ToolClient,
    event: NodeReplTurnEvent,
    private options: { defaultJsTimeoutMs?: number } = {},
  ) {
    const timeout = options.defaultJsTimeoutMs;
    if (
      timeout !== undefined &&
      (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000)
    )
      throw new Error(
        "Default JS timeout must be an integer from 1 to 60000 ms",
      );
    this.event = Object.freeze(parseNodeReplTurnEvent(event));
  }
  getInstructions(): string | undefined { return this.client.getInstructions?.(); }
  async listTools(signal?: AbortSignal) {
    return (await this.client.listTools(signal)).filter(
      (tool) => tool.name !== "turn_ended",
    );
  }
  async callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    if (call.name === "turn_ended")
      return Promise.reject(
        new Error("turn_ended is a host lifecycle operation"),
      );
    if (this.ending)
      return Promise.reject(new Error("NodeREPL turn has ended"));
    // Caller policy only: use the original supervisor's documented timeout field.
    // Summary-only calls are a distinct native branch: never add execution fields.
    // An explicit caller/model timeout (including invalid values) is never replaced.
    if (
      call.name === "js" &&
      Object.hasOwn(call.arguments, "code") &&
      !Object.hasOwn(call.arguments, "completion_summary") &&
      call.arguments.timeout_ms === undefined &&
      this.options.defaultJsTimeoutMs !== undefined
    )
      call = {
        ...call,
        arguments: {
          ...call.arguments,
          timeout_ms: this.options.defaultJsTimeoutMs,
        },
      };
    const result = await this.client.callTool(call, signal);
    // Observed browser error prefixes, not arbitrary text in a successful page
    // snapshot. This caller policy stops the demo; it does not alter native gates.
    const denied = call.name === "js" && result.isError && result.content.some(item =>
      item.type === "text" && (
        item.text.startsWith("Browser Use rejected this action due to browser security policy. Reason:") ||
        item.text.startsWith("Browser Use could not complete this action because a browser security check was unavailable. Reason:")
      ));
    return denied ? { ...result, stopReason: {
      kind: "authorization",
      message: "浏览器安全检查未放行，本次任务未完成。已停止后续工具调用；具体拒绝信息见工具日志。",
    } } : result;
  }
  endTurn(): Promise<void> {
    return (this.ending ??= (async () => {
      // Do not reuse a cancelled model/tool signal: cleanup has its own request.
      const result = await this.client.callTool({
        id: "host-turn-ended",
        name: "turn_ended",
        arguments: { ...this.event },
      });
      if (result.isError)
        throw new Error(
          `NodeREPL turn cleanup failed: ${result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n")}`,
        );
    })());
  }
  close() {
    return this.client.close();
  }
}
