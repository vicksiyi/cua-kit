/** Independent MCP adapter. The caller still owns the production worker launcher/policy. */
import { Server } from "@modelcontextprotocol/sdk/server";
// These SDK wildcard subpaths require their published .js suffix in native Node ESM.
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ContentBlockSchema,
  ElicitRequestFormParamsSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { WorkerSession, type SessionOptions, type Message } from "./session";
import { decodeMediaMessage } from "./media";
import { supervisorTools } from "./mcp-tools";

const jsInput = z
  .object({
    code: z.string(),
    timeout_ms: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    title: z.string().min(1).max(80).optional(),
  })
  .strict();
const turnInput = z
  .object({
    hook_event_name: z.string().min(1),
    session_id: z.string().min(1),
    turn_id: z.string().min(1),
  })
  .strict();
const moduleInput = z.object({ path: z.string().min(1) }).strict();
const emptyInput = z.object({}).strict();
function toolError(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}
/** Text and standard MCP content only; opaque worker content must never silently disappear. */
export function workerResultToMcp(result: Message): CallToolResult {
  const content: CallToolResult["content"] = [];
  if (result.output !== undefined && typeof result.output !== "string")
    throw Error("Invalid worker text output");
  if (result.output) content.push({ type: "text", text: result.output });
  if (result.named_outputs !== undefined) {
    if (!Array.isArray(result.named_outputs) ||
        !result.named_outputs.every(item => typeof item === "string"))
      throw Error("Invalid worker named text output");
    for (const text of result.named_outputs)
      content.push({ type: "text", text });
  }
  if (result.content_items !== undefined) {
    if (!Array.isArray(result.content_items))
      throw Error("Invalid worker content items");
    for (const item of result.content_items)
      content.push(ContentBlockSchema.parse(item));
  }
  if (result.ok === false)
    content.push({
      type: "text",
      text:
        typeof result.error === "string"
          ? result.error
          : "JavaScript execution failed",
    });
  const meta = result.response_meta;
  if (
    meta !== undefined &&
    (!meta || typeof meta !== "object" || Array.isArray(meta))
  )
    throw Error("Invalid worker response metadata");
  return {
    content,
    isError: result.ok === false,
    ...(meta === undefined ? {} : { _meta: meta }),
  };
}
export function createSupervisorMcpServer(options: SessionOptions) {
  const server = new Server(
    { name: "core-runtime-supervisor", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Use js for persistent JavaScript, js_reset to clear bindings. turn_ended is host lifecycle only. js_add_node_module_dir requires host module-directory policy.",
    },
  );
  const session = new WorkerSession({
    ...options,
    hostRequest: async (message, context) => {
      if (message.type === "emit_image" || message.type === "emit_audio") {
        const content = await decodeMediaMessage(message);
        context.appendContent(content);
        return { ok: true };
      }
      if (message.type === "elicit") {
        const params = ElicitRequestFormParamsSchema.parse({
          mode: "form",
          message: message.message,
          requestedSchema: message.requested_schema,
          ...(message.meta == null ? {} : { _meta: message.meta }),
        });
        const result = await server.elicitInput(params, {
          signal: context.signal,
        });
        return { ...result, ok: true };
      }
      if (!options.hostRequest)
        throw Error(`Host operation is not configured: ${message.type}`);
      return options.hostRequest(message, context);
    },
  });
  let cleanup: Promise<void> | undefined;
  // SDK onclose is synchronous; keep an observable promise for callers awaiting teardown.
  const retire = () => (cleanup ??= session.close());
  server.onclose = () => {
    void retire().catch((error) =>
      server.onerror?.(error instanceof Error ? error : Error(String(error))),
    );
  };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: supervisorTools,
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const { name, arguments: args = {} } = request.params;
      const common = {
        signal: extra.signal,
        requestMeta: request.params._meta,
        formElicitationSupported:
          server.getClientCapabilities()?.elicitation?.form !== undefined,
      };
      if (name === "js") {
        const input = jsInput.parse(args);
        return workerResultToMcp(
          await session.execute(input.code, {
            ...common,
            timeoutMs: input.timeout_ms,
          }),
        );
      }
      if (name === "js_add_node_module_dir") {
        const input = moduleInput.parse(args);
        await session.addNodeModuleDirectory(input.path, extra.signal);
        return {
          content: [{ type: "text", text: "Module directory registered." }],
        };
      }
      if (name === "js_reset") {
        emptyInput.parse(args);
        if (extra.signal.aborted)
          throw Error("Reset cancelled before dispatch");
        await session.reset();
        return { content: [{ type: "text", text: "Session reset." }] };
      }
      if (name === "turn_ended") {
        return workerResultToMcp(
          await session.turnEnded(turnInput.parse(args), common),
        );
      }
      throw Error(`Unsupported tool: ${name}`);
    } catch (error) {
      return toolError(error);
    }
  });
  return {
    server,
    session,
    close: async () => {
      try {
        await server.close();
      } finally {
        await retire();
      }
    },
  };
}
