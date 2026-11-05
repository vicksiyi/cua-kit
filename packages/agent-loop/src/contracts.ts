/** Agent-neutral v1 contracts. Transport/provider-specific objects do not cross this boundary. */
export type Content =
  | { type: "text"; text: string }
  | { type: "image" | "audio"; mimeType: string; data: string };
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface ToolResult {
  content: Content[];
  isError?: boolean;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content?: string; toolCalls?: ToolCall[] }
  | { role: "tool"; callId: string; name: string; result: ToolResult };
export interface ToolClient {
  /** Initialization guidance from the configured tool provider, not tool-result content. */
  getInstructions?(): string | undefined;
  listTools(signal?: AbortSignal): Promise<ToolDefinition[]>;
  callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult>;
  /** Optional host lifecycle cleanup, independent of the model cancellation signal. */
  endTurn?(): Promise<void>;
  close(): Promise<void>;
}
export interface ModelAdapter {
  decide(input: {
    system: string;
    messages: readonly AgentMessage[];
    tools: readonly ToolDefinition[];
    signal?: AbortSignal;
  }): Promise<{ text?: string; toolCalls?: ToolCall[] }>;
}
