import {
  kernelBrowserOutcome,
  registerKernelSessionTools,
  type KernelJsHandler,
  type KernelJsClient,
  type KernelJsContext,
} from "./kernel_js_handler";
export interface TunnelRequestContext {
  channel: string;
  requestId: string;
}
export interface TunnelToolSchema extends Record<string, unknown> {
  inputSchema: any;
}
type Method = (
  params: any,
  client: KernelJsClient,
  signal: AbortSignal,
  context: TunnelRequestContext,
) => unknown | Promise<unknown>;
type Tool = (
  input: any,
  client: KernelJsClient,
  signal: AbortSignal,
  context: KernelJsContext,
) => unknown | Promise<unknown>;
/** Original Nr. Deliberately retains prototype-bearing object behavior. */
export function isTunnelObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
/** Original $s is this limited local schema validator, not the MCP SDK/Zod.
 * Retain its exact supported types and inherited-key semantics. */
export function validateTunnelToolArguments(
  value: any,
  schema: any,
): boolean | undefined {
  if ("enum" in schema && schema.enum != null)
    return schema.enum.some((item: unknown) => Object.is(item, value));
  switch (schema.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "array":
      return (
        Array.isArray(value) &&
        value.every((item) => validateTunnelToolArguments(item, schema.items))
      );
    case "object":
      if (
        !isTunnelObject(value) ||
        schema.required?.some((key: string) => !(key in value))
      )
        return false;
      for (const [key, property] of Object.entries(schema.properties))
        if (key in value && !validateTunnelToolArguments(value[key], property))
          return false;
      return schema.additionalProperties === false
        ? Object.keys(value).every((key) => key in schema.properties)
        : true;
  }
}
/** Original t_. Only tool-level _meta is authoritative; metadata nested in
 * arguments is discarded before invoking the tool. */
export function normalizeTunnelToolContext(
  metadata: Record<string, any> | undefined,
  request: TunnelRequestContext,
): KernelJsContext {
  const requestMeta = { ...metadata };
  const raw = requestMeta["x-codex-turn-metadata"];
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const turnMetadata = isTunnelObject(parsed) ? parsed : undefined;
  const scopeId = turnMetadata?.thread_id || turnMetadata?.session_id;
  if (scopeId)
    requestMeta["x-codex-turn-metadata"] = {
      ...turnMetadata,
      sandbox: turnMetadata?.sandbox || "",
      session_id: turnMetadata?.session_id || scopeId,
      turn_id: turnMetadata?.turn_id || request.requestId,
    };
  else Reflect.deleteProperty(requestMeta, "x-codex-turn-metadata");
  return { channel: request.channel, requestMeta, scopeId, turnMetadata };
}
/** Original e_: MCP method/tool dispatch inside the browser-use tunnel.
 * This is a dispatcher, not the HTTP polling/response transport. */
export class TunnelMcpServer {
  readonly methods = new Map<string, { callback: Method }>();
  readonly tools = new Map<
    string,
    { callback: Tool; schema: TunnelToolSchema }
  >();
  constructor(
    readonly serverInfo: unknown,
    randomUUID: () => string = () => crypto.randomUUID(),
  ) {
    this.registerMethod("initialize", () => ({
      headers: { "Mcp-Session-Id": [randomUUID()] },
      result: {
        capabilities: { tools: { listChanged: false } },
        protocolVersion: "2025-06-18",
        serverInfo: this.serverInfo,
      },
    }));
    this.registerMethod("ping", () => ({ result: {} }));
    this.registerMethod("tools/list", () => ({
      result: {
        tools: [...this.tools].map(([name, tool]) => ({
          name,
          ...tool.schema,
        })),
      },
    }));
    this.registerMethod("tools/call", (params, client, signal, context) =>
      this.callTool(params, client, signal, context),
    );
  }
  registerTool(name: string, schema: TunnelToolSchema, callback: Tool) {
    if (this.tools.has(name))
      throw new Error(`MCP tool is already registered: ${name}`);
    this.tools.set(name, {
      schema,
      callback: (input, client, signal, context) =>
        validateTunnelToolArguments(input, schema.inputSchema)
          ? callback(input, client, signal, context)
          : Promise.resolve({
              _meta: kernelBrowserOutcome("invalid_tool_arguments"),
              content: [{ type: "text", text: "Invalid tool arguments" }],
              isError: true,
            }),
    });
  }
  unregisterTool(name: string) {
    this.tools.delete(name);
  }
  registerMethod(name: string, callback: Method) {
    this.methods.set(name, { callback });
  }
  async callMethod(
    name: string,
    params: unknown,
    client: KernelJsClient,
    signal: AbortSignal,
    context: TunnelRequestContext,
  ) {
    const method = this.methods.get(name);
    return method == null
      ? { error: { code: -32601, message: "Method not found" } }
      : await method.callback(params, client, signal, context);
  }
  async callTool(
    params: unknown,
    client: KernelJsClient,
    signal: AbortSignal,
    request: TunnelRequestContext,
  ) {
    if (!isTunnelObject(params) || typeof params.name !== "string")
      return { error: { code: -32601, message: "Method not found" } };
    const tool = this.tools.get(params.name);
    if (tool == null)
      return { error: { code: -32601, message: "Method not found" } };
    try {
      let input = params.arguments;
      if (isTunnelObject(input)) {
        input = { ...input };
        delete input._meta;
      }
      const context = normalizeTunnelToolContext(
        isTunnelObject(params._meta) ? params._meta : undefined,
        request,
      );
      return { result: await tool.callback(input, client, signal, context) };
    } catch {
      return signal.aborted
        ? null
        : {
            result: {
              _meta: kernelBrowserOutcome("unclassified_tool_error"),
              content: [{ type: "text", text: "Tool execution failed" }],
              isError: true,
            },
          };
    }
  }
}
export function createKernelTunnelMcpServer<Pdf>(
  handler: KernelJsHandler<Pdf>,
  randomUUID?: () => string,
) {
  const server = new TunnelMcpServer(
    { name: "node-repl-work", version: "0.0.1" },
    randomUUID,
  );
  registerKernelSessionTools(handler, server);
  return server;
}
