import { BrowserRuntimeFactory } from "./runtime/factory";
import { createDisplaySideEffect, type DisplayBridge } from "./runtime/display";
import type { ExecuteAgentCommand } from "./runtime/function_agent_transport";
/** Original extension worker dp: direct agent transport, without Node RPC setup. */
export function createKernelBrowserRuntime({ apiManifest, decorateTab, disabledMemberIds, displayBridge, executeAgentCommand }: ConstructorParameters<typeof BrowserRuntimeFactory>[0] & {
  displayBridge: DisplayBridge;
  executeAgentCommand: ExecuteAgentCommand;
}) {
  return new BrowserRuntimeFactory({ apiManifest, decorateTab, disabledMemberIds }).createAgent({
    displaySideEffect: createDisplaySideEffect({ displayBridge, displayTruncateMaxChars: 100000 }),
    executeAgentCommand,
  });
}
