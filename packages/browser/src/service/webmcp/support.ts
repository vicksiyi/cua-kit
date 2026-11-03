import { webMcpTabCapabilityDefinition } from "../../capabilities/tab_web_mcp";
import { WebMcpInvokeTool } from "../../commands/web_mcp";
import {
  codexTurnMetadata,
  type PreferenceRuntime,
} from "../preferences/request_context";
import { approvalRuntime, browserDisplayName } from "../security/approval";
export interface WebMcpSupportContext {
  runtime: PreferenceRuntime;
  clientInfo: { name: string };
  supportsTabCapability(id: string): Promise<boolean>;
}
/** Original BA/Ja. Model rejection precedes capability probing. */
export async function assertWebMcpSupported(
  command: string,
  context: WebMcpSupportContext,
) {
  const value = codexTurnMetadata(context.runtime)?.model;
  const model = typeof value === "string" ? value.toLowerCase() : undefined;
  if (model?.includes("-luna"))
    throw new Error(`${model} does not support command "${command}".`);
  if (!(await context.supportsTabCapability(webMcpTabCapabilityDefinition.id)))
    throw new Error(
      `${context.clientInfo.name} does not support command "${command}".`,
    );
}
/** Original tD/uc/rD. Read inherited object fields, including arrays; reject primitives. */
export function webMcpApprovalIntent(
  payload: unknown,
  options: Parameters<typeof browserDisplayName>[0],
) {
  const field = (key: string) =>
    payload != null && typeof payload === "object"
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  const name = field("tool_name");
  if (typeof name !== "string" || name.trim().length === 0)
    approvalRuntime.failCheck(
      {
        check: "webmcp-tool-call",
        options,
        reason: "browser_context_unavailable",
      },
      `${browserDisplayName(options)} could not determine the WebMCP tool name before requesting approval.`,
    );
  const description = field("tool_description"),
    title = field("tool_title"),
    origin = field("tool_origin");
  return {
    input: field("input") ?? null,
    toolDescription: typeof description === "string" ? description : undefined,
    toolName: name,
    toolOrigin: typeof origin === "string" ? origin : undefined,
    toolTitle: typeof title === "string" ? title : undefined,
    type: WebMcpInvokeTool.commandType,
  };
}
