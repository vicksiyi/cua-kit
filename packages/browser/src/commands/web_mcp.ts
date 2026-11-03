import { z } from "../vendor/bundled_zod";
import { Command } from "./command";
const annotationsSchema = z.object({
  readOnlyHint: z.boolean().optional(),
  untrustedContentHint: z.boolean().optional(),
  consequentialHint: z.boolean().optional(),
});
const toolSchema = z.object({
  name: z.string(),
  call_name: z.string(),
  registration_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  input_schema: z.unknown(),
  annotations: annotationsSchema.optional(),
  origin: z.string().optional(),
  pageUrl: z.string().optional(),
});
/** Original Ca / Ra / Pa / Ea / Aa. */
export namespace WebMcpListTools {
  export const commandType = "webmcp_list_tools";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
  });
  export const ResultSchema = z.object({ tools: z.array(toolSchema) });
  export function create(payload: { browser_id: string; tab_id: string }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
/** Original $a / Za / Na. */
export namespace WebMcpInvokeTool {
  export const commandType = "webmcp_invoke_tool";
  export const PayloadSchema = z.object({
    browser_id: z.string(),
    tab_id: z.string(),
    tool_name: z.string(),
    tool_description: z.string().optional(),
    tool_origin: z.string().optional(),
    tool_title: z.string().optional(),
    registration_id: z.string(),
    input: z.unknown(),
    timeout_ms: z.number().int().positive().optional(),
  });
  export const ResultSchema = z.object({ result: z.unknown() });
  export function create(payload: {
    browser_id: string;
    tab_id: string;
    tool_name: string;
    tool_description?: string;
    tool_origin?: string;
    tool_title?: string;
    registration_id: string;
    input: unknown;
    timeout_ms?: number;
  }) {
    return new Command(commandType, PayloadSchema, payload);
  }
}
