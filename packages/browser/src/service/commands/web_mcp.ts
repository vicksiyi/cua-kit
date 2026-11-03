import { WebMcpInvokeTool, WebMcpListTools } from "../../commands/web_mcp";
import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { downloadSourceOrigin } from "../context/downloads";
import { invokeWebMcpTool } from "../webmcp/host";
import { staleWebMcpRegistration } from "../webmcp/frame_discovery";
import {
  assertWebMcpPageEnabled,
  assertWebMcpCatalogEnabled,
  findSessionWebMcpTool,
  rememberWebMcpTools,
} from "../webmcp/session_catalog";
import {
  assertWebMcpSupported,
  webMcpApprovalIntent,
  type WebMcpSupportContext,
} from "../webmcp/support";
import {
  createWebMcpToolDirectory,
  type WebMcpDirectoryContext,
  type WebMcpDirectoryDependencies,
} from "../webmcp/tool_directory";
export interface WebMcpCommandContext extends WebMcpDirectoryContext {
  clientInfo: WebMcpDirectoryContext["clientInfo"] & {
    name: string;
    family?: string;
  };
  runtime: WebMcpDirectoryContext["runtime"] & WebMcpSupportContext["runtime"];
  supportsTabCapability(id: string): Promise<boolean>;
  elicitationDisplayName?: string;
  security: WebMcpDirectoryContext["security"] & {
    currentTabUrl(tabId: number): Promise<string>;
  };
  acquireAuthority(): {
    useWebMcp(
      url: string,
      intent: any,
      tabId: number,
    ): { assert(): Promise<unknown> };
  };
  sendWebMcpToolInvoked(event: {
    parentCallId: unknown;
    tabId: number;
    toolName: string;
  }): unknown;
}
/** Original Mh. Resolved session catalog metadata replaces caller-supplied approval labels. */
export const WebMcpInvokeToolCommand = defineCommand(
  WebMcpInvokeTool,
  async (payload: any, context: WebMcpCommandContext) => {
    const parentCallId = context.runtime.requestMeta?.callId,
      tabId = positiveTabId(payload.tab_id);
    await assertWebMcpSupported(WebMcpInvokeTool.commandType, context);
    const pageUrl = await assertWebMcpPageEnabled(context, tabId);
    assertWebMcpCatalogEnabled(context, tabId);
    const tool = findSessionWebMcpTool(context, tabId, payload.registration_id);
    if (tool?.origin == null) throw new Error(staleWebMcpRegistration);
    if (tool.origin !== downloadSourceOrigin(pageUrl))
      await context.security.assertWebMcpOriginEnabled(tool.origin);
    payload.tool_name = tool.name;
    payload.tool_title = tool.title;
    payload.tool_description = tool.description;
    payload.tool_origin = tool.origin;
    const intent = webMcpApprovalIntent(payload, {
      browserBackend: context.clientInfo.type,
      browserFamily: context.clientInfo.family,
      elicitationDisplayName: context.elicitationDisplayName,
    });
    await context.acquireAuthority().useWebMcp(pageUrl, intent, tabId).assert();
    await assertWebMcpSupported(WebMcpInvokeTool.commandType, context);
    if (findSessionWebMcpTool(context, tabId, payload.registration_id) == null)
      throw new Error(staleWebMcpRegistration);
    context.sendWebMcpToolInvoked({
      parentCallId,
      tabId,
      toolName: payload.tool_name,
    });
    const result = await invokeWebMcpTool(
      context.cdp,
      tabId,
      payload.registration_id,
      payload.input,
      payload.timeout_ms,
    );
    if (result !== null && typeof result !== "string")
      throw new Error("WebMCP executeTool returned an invalid result.");
    return { result };
  },
);
/** Original TN/Bh assembly. Configuration/feature/telemetry dependencies belong to the host bootstrap. */
export function createWebMcpListToolsCommand(
  dependencies: Omit<WebMcpDirectoryDependencies, "assertSupported">,
) {
  const directory = createWebMcpToolDirectory({
    ...dependencies,
    assertSupported: (command, context) =>
      assertWebMcpSupported(command, context as WebMcpCommandContext),
  });
  return defineCommand(
    WebMcpListTools,
    async (payload: { tab_id: unknown }, context: WebMcpCommandContext) => {
      const tabId = positiveTabId(payload.tab_id),
        url = await context.security.currentTabUrl(tabId);
      await context
        .acquireAuthority()
        .useWebMcp(url, { type: WebMcpListTools.commandType }, tabId)
        .assert();
      const result = await directory(context, tabId);
      rememberWebMcpTools(context, tabId, result);
      return { tools: result.tools };
    },
  );
}
