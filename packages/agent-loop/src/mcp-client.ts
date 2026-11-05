import {
  ElicitRequestSchema,
  type ElicitRequestParams,
  type ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  Content,
  ToolCall,
  ToolClient,
  ToolDefinition,
  ToolResult,
} from "./contracts";

export interface McpClientOptions {
  /** Host-supplied protocol context, never populated from model tool arguments. */
  requestMeta?: () => Record<string, unknown>;
  /** Optional host UI for form elicitation. No implicit acceptance is provided. */
  elicit?: (
    params: ElicitRequestParams,
  ) => ElicitResult | Promise<ElicitResult>;
}
export class McpToolClient implements ToolClient {
  private constructor(
    private client: Client,
    private options: McpClientOptions,
  ) {}
  static async connect(
    parameters: StdioServerParameters,
    options: McpClientOptions = {},
  ): Promise<McpToolClient> {
    const client = new Client(
      { name: "cua-kit-agent-demo", version: "0.1.0" },
      options.elicit
        ? { capabilities: { elicitation: { form: {} } } }
        : undefined,
    );
    if (options.elicit)
      client.setRequestHandler(ElicitRequestSchema, (request) =>
        options.elicit!(request.params),
      );
    try {
      await client.connect(new StdioClientTransport({...parameters,maxBufferSize:parameters.maxBufferSize ?? 64*1024*1024}));
      return new McpToolClient(client, options);
    } catch (error) {
      await client.close();
      throw error;
    }
  }
  getInstructions(): string | undefined { return this.client.getInstructions(); }
  async listTools(signal?: AbortSignal): Promise<ToolDefinition[]> {
    const definitions: ToolDefinition[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.client.listTools({ cursor }, { signal });
      definitions.push(
        ...result.tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema,
        })),
      );
      cursor = result.nextCursor;
    } while (cursor);
    return definitions;
  }
  async callTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    const result = await this.client.callTool(
      {
        name: call.name,
        arguments: call.arguments,
        _meta: this.options.requestMeta?.(),
      },
      undefined,
      { signal, timeout: 65000 },
    );
    const content: Content[] = [];
    if (!Array.isArray(result.content))
      throw new Error("MCP tool returned unsupported content envelope.");
    for (const item of result.content) {
      if (item.type === "text" && typeof item.text === "string")
        content.push({ type: "text", text: item.text });
      else if (
        (item.type === "image" || item.type === "audio") &&
        typeof item.data === "string" &&
        typeof item.mimeType === "string"
      )
        content.push({
          type: item.type,
          data: item.data,
          mimeType: item.mimeType,
        });
      else throw new Error(`Unsupported MCP content type: ${item.type}`);
    }
    return { content, isError: result.isError === true };
  }
  close(): Promise<void> {
    return this.client.close();
  }
}
