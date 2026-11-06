/** Demo inventory: source CUA getState reports independent surface failures in errors. */
import type { AgentMessage, ToolClient } from "./contracts";
export async function unifiedPreflight(
  tools: ToolClient,
  options: { signal?: AbortSignal; onMessage?: (message: AgentMessage) => void } = {},
): Promise<AgentMessage[]> {
  options.signal?.throwIfAborted();
  const call = {
    id: "host-unified-preflight", name: "js",
    arguments: { code: "await cua.getState();", title: "Inspect available browsers and native apps" },
  };
  const request: AgentMessage = { role: "assistant", toolCalls: [call] };
  options.onMessage?.(request);
  const result = await tools.callTool(call, options.signal);
  const response: AgentMessage = { role: "tool", callId: call.id, name: call.name, result };
  options.onMessage?.(response);
  if (result.isError || result.stopReason)
    throw new Error("Unified CUA inventory failed; no model request or UI action was performed.");
  // Preserve the complete observation, including per-surface errors, for selection.
  // A missing browser does not imply the native app service is unavailable.
  return [request, response];
}
