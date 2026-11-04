/** Demo readiness check; the reconstructed Sky implementation remains unchanged. */
import type { AgentMessage, ToolClient } from "./contracts";
export class ComputerUnavailableError extends Error {
  constructor() {
    super("Native computer preflight failed; app inventory could not be verified. No model request or app action was performed.");
    this.name = "ComputerUnavailableError";
  }
}
export async function computerPreflight(
  tools: ToolClient,
  options: { signal?: AbortSignal; onMessage?: (message: AgentMessage) => void } = {},
): Promise<AgentMessage[]> {
  const call = {
    id: "host-computer-preflight",
    name: "js",
    arguments: {
      code: 'const computerApps = await cua.listApps({emit:false}); nodeRepl.write(JSON.stringify({cuaComputerConnected:true,appCount:computerApps.length}));',
      title: "Check native computer service",
    },
  };
  const request: AgentMessage = { role: "assistant", toolCalls: [call] };
  options.onMessage?.(request);
  const result = await tools.callTool(call, options.signal);
  const response: AgentMessage = { role: "tool", callId: call.id, name: call.name, result };
  options.onMessage?.(response);
  const verified = result.content.some(item => {
    if (item.type !== "text") return false;
    try {
      const value = JSON.parse(item.text);
      return value?.cuaComputerConnected === true && Number.isInteger(value.appCount) && value.appCount >= 0;
    } catch { return false; }
  });
  if (result.isError || !verified)
    throw new ComputerUnavailableError();
  return [request, response];
}
