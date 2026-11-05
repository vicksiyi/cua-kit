/** Demo policy, not part of the reconstructed CUA implementation. */
import type { AgentMessage, ToolClient } from "./contracts";

export async function browserPreflight(
  tools: ToolClient,
  options: {
    signal?: AbortSignal;
    onMessage?: (message: AgentMessage) => void;
  } = {},
): Promise<AgentMessage[]> {
  const call = {
    id: "host-browser-preflight",
    name: "js",
    arguments: {
      code: "await cua.getState();",
      title: "Check connected browser backends",
    },
  };
  const messages: AgentMessage[] = [{ role: "assistant", toolCalls: [call] }];
  options.onMessage?.(messages[0]!);
  const result = await tools.callTool(call, options.signal);
  const reply: AgentMessage = {
    role: "tool",
    callId: call.id,
    name: call.name,
    result,
  };
  messages.push(reply);
  options.onMessage?.(reply);
  if (result.isError)
    throw new Error(
      "Browser preflight failed; no browser actions were performed.",
    );
  // Inspect a separate machine-readable result. getState above emits the API
  // documentation needed by the agent, while this call avoids parsing prose.
  const inventoryCall = {
    id: "host-browser-inventory",
    name: "js",
    arguments: {
      code: "{ const state = await cua.getState({emit:false}); nodeRepl.write(JSON.stringify({cuaBrowserCount:state.browsers.length,browsers:state.browsers})); }",
      title: "Verify browser availability",
    },
  };
  const request: AgentMessage = {
    role: "assistant",
    toolCalls: [inventoryCall],
  };
  messages.push(request);
  options.onMessage?.(request);
  const inventory = await tools.callTool(inventoryCall, options.signal);
  const response: AgentMessage = {
    role: "tool",
    callId: inventoryCall.id,
    name: inventoryCall.name,
    result: inventory,
  };
  messages.push(response);
  options.onMessage?.(response);
  const count = inventory.content
    .flatMap((item) => {
      if (item.type !== "text") return [];
      try {
        return [JSON.parse(item.text)?.cuaBrowserCount];
      } catch {
        return [];
      }
    })
    .find((value) => Number.isInteger(value) && value >= 0);
  if (inventory.isError || count === undefined)
    throw new Error(
      "Browser preflight could not verify the backend inventory.",
    );
  if (count === 0)
    throw new Error(
      "No connected browser backend. Browser search was not executed. Check the extension/native-host connection; this does not mean Chrome is not installed.",
    );
  return messages;
}
