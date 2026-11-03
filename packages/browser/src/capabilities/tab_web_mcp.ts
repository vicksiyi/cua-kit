import { TabCapability, defineTabCapability } from "./base";
import type { TabCapabilityOptions } from "./base";
import { WebMcpListTools, WebMcpInvokeTool } from "../commands/web_mcp";
export interface WebMcpToolRecord {
  name: string;
  call_name: string;
  registration_id: string;
  title?: string;
  description?: string;
  input_schema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
  };
  origin?: string;
  pageUrl?: string;
}
/** Original _h: internal registration id is not exposed in the display descriptor. */
export function toWebMcpToolDescriptor(tool: WebMcpToolRecord) {
  return {
    name: tool.name,
    call_name: tool.call_name,
    ...(tool.title == null ? {} : { title: tool.title }),
    ...(tool.description == null ? {} : { description: tool.description }),
    inputSchema: tool.input_schema,
    ...(tool.annotations == null ? {} : { annotations: tool.annotations }),
    ...(tool.origin == null ? {} : { origin: tool.origin }),
    ...(tool.pageUrl == null ? {} : { pageUrl: tool.pageUrl }),
  };
}
export const webMcpTabCapabilityInfo = {
  id: "webmcp",
  description:
    "Fetch page-defined WebMCP tools bound to the current document, then call them through the returned object.",
};
/** Original yh: each fetch owns an immutable wrapper and a document tool snapshot. */
export class TabWebMcpCapability extends TabCapability {
  constructor({
    browserId,
    documentation,
    info,
    tabId,
    transport,
  }: TabCapabilityOptions) {
    super(transport, browserId, tabId, documentation, info);
  }
  async fetchTools() {
    const result = WebMcpListTools.ResultSchema.parse(
      await this.transport.send({
        command: WebMcpListTools.create({
          browser_id: this.browserId,
          tab_id: this.tabId,
        }),
      }),
    );
    const descriptors = result.tools.map(toWebMcpToolDescriptor);
    const toolsByCallName = new Map<string, WebMcpToolRecord>(
      result.tools.map((tool: WebMcpToolRecord) => [tool.call_name, tool]),
    );
    const description =
      descriptors.length === 0
        ? "No WebMCP tools are available in this document."
        : [
            "WebMCP tools available in this document:",
            JSON.stringify(
              descriptors.map(
                ({
                  call_name,
                  ...tool
                }: ReturnType<typeof toWebMcpToolDescriptor>) => ({
                  ...tool,
                  name: call_name,
                }),
              ),
              null,
              2,
            ),
            "Call tools.call(name, input) to invoke one.",
          ].join("\n");
    return Object.freeze({
      description: () => description,
      call: async (
        name: string,
        input: unknown,
        options?: { timeoutMs?: number },
      ) => {
        const callName = name.trim(),
          tool = toolsByCallName.get(callName);
        if (tool == null)
          throw new Error(
            `WebMCP tool ${JSON.stringify(callName)} is not available in this snapshot. Call fetchTools() again.`,
          );
        return (
          await this.transport.send({
            command: WebMcpInvokeTool.create({
              browser_id: this.browserId,
              tab_id: this.tabId,
              tool_name: tool.name,
              tool_description: tool.description,
              tool_title: tool.title,
              registration_id: tool.registration_id,
              input,
              ...(options?.timeoutMs == null
                ? {}
                : { timeout_ms: options.timeoutMs }),
            }),
          })
        ).result;
      },
    });
  }
}
export const webMcpTabCapabilityDefinition = defineTabCapability({
  capability: TabWebMcpCapability,
  info: webMcpTabCapabilityInfo,
});
