import { BrowserRuntimeFactory } from "./factory";
import { createDisplaySideEffect } from "./display";
import { createBrowserServiceExecutor } from "./browser_service_executor";
import type { Tab } from "../tab";
/** Host structural contract inferred from original Im; this does not implement the host RPC service. */
interface BrowserNodeRepl {
  rpc(service: string, args: { method: string; params: unknown }): Promise<any>;
  env?: { CUA_REPL_BROWSER_ENV?: string };
  emitImage(value: Uint8Array): unknown | Promise<unknown>;
}
export interface BrowserRuntimeOptions {
  environment?: string;
  undocumentedApiMembers?: unknown;
  excludedDocumentation?: unknown;
  decorateTab?: (tab: Tab) => unknown;
}
/** Original Im. The host method is intentionally detached before invoking it. */
export async function setupBrowserRuntime(options: BrowserRuntimeOptions = {}) {
  const nodeRepl = (
    globalThis as typeof globalThis & { nodeRepl?: BrowserNodeRepl }
  ).nodeRepl;
  if (nodeRepl == null || typeof nodeRepl.rpc !== "function")
    throw new Error("Browser use requires a trusted Node REPL browser service");
  const rpc = nodeRepl.rpc,
    environment =
      nodeRepl.env?.CUA_REPL_BROWSER_ENV === "orbit"
        ? "orbit"
        : options.environment;
  const setup = (params: unknown) =>
      rpc("browser", { method: "setup", params }),
    execute = (params: Record<string, unknown>) =>
      rpc("browser", { method: "execute", params }),
    executeWithRecovery = (params: Record<string, unknown>) =>
      rpc("browser", { method: "executeWithRecovery", params });
  const { apiManifest, disabledMemberIds, credentialRecoveryErrorVersion } =
    await setup({
      environment: options.environment ?? "codex-app",
      undocumentedApiMembers: options.undocumentedApiMembers,
      excludedDocumentation: options.excludedDocumentation,
    });
  const factory = new BrowserRuntimeFactory({
    apiManifest,
    decorateTab: options.decorateTab,
    disabledMemberIds: new Set(disabledMemberIds),
  });
  return factory.createAgent({
    displaySideEffect: createDisplaySideEffect({
      displayBridge: {
        displayImage: (value) => nodeRepl.emitImage(value),
        displayValue: (value) => console.log(value),
      },
      displayTruncateMaxChars: 100000,
    }),
    executeAgentCommand: createBrowserServiceExecutor({
      execute,
      executeWithRecovery,
      credentialRecoveryErrorVersion,
      environment,
    }),
  });
}
