/** Demo policy, not part of the reconstructed CUA implementation. */
import type { AgentMessage, ToolClient } from "./contracts";
import { setTimeout as delay } from "node:timers/promises";

class BrowserPreflightError extends Error {}

type PreflightOptions = {
  signal?: AbortSignal;
  onMessage?: (message: AgentMessage) => void;
  onRetry?: (error: Error) => void;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export async function browserPreflight(
  tools: ToolClient,
  options: PreflightOptions = {},
): Promise<AgentMessage[]> {
  const messages: AgentMessage[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    options.signal?.throwIfAborted();
    try {
      await browserPreflightAttempt(tools, options, messages, attempt);
      return messages;
    } catch (error) {
      if (attempt !== 0 || !(error instanceof BrowserPreflightError)) throw error;
      options.signal?.throwIfAborted();
      options.onRetry?.(error);
      await (options.wait ?? ((ms, signal) => delay(ms, undefined, {signal})))(2000, options.signal);
    }
  }
  throw Error("Unreachable browser preflight state");
}

async function browserPreflightAttempt(
  tools: ToolClient, options: PreflightOptions, messages: AgentMessage[], attempt: number,
): Promise<void> {
  const suffix = attempt ? "-retry" : "";
  const call = {
    id: `host-browser-preflight${suffix}`,
    name: "js",
    arguments: {
      code: "await cua.getState();",
      title: "Check connected browser backends",
    },
  };
  const stateRequest: AgentMessage = { role: "assistant", toolCalls: [call] };
  messages.push(stateRequest);
  options.onMessage?.(stateRequest);
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
    throw new BrowserPreflightError(
      "Browser preflight failed; no browser actions were performed.",
    );
  // Inspect a separate machine-readable result. getState above emits the API
  // documentation needed by the agent, while this call avoids parsing prose.
  const inventoryCall = {
    id: `host-browser-inventory${suffix}`,
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
    throw new BrowserPreflightError(
      "Browser preflight could not verify the backend inventory.",
    );
  if (count === 0)
    throw new BrowserPreflightError(
      "No connected browser backend. Browser search was not executed. Check the extension/native-host connection; this does not mean Chrome is not installed.",
    );
}
