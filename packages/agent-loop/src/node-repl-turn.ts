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
  ) {
    this.event = Object.freeze(parseNodeReplTurnEvent(event));
  }
  async listTools(signal?: AbortSignal) {
    return (await this.client.listTools(signal)).filter(
      (tool) => tool.name !== "turn_ended",
    );
  }
  callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    if (call.name === "turn_ended")
      return Promise.reject(
        new Error("turn_ended is a host lifecycle operation"),
      );
    if (this.ending)
      return Promise.reject(new Error("NodeREPL turn has ended"));
    return this.client.callTool(call, signal);
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
