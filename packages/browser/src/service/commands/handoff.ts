import { browserAuthTabCapabilityDefinition } from "../../capabilities/tab_browser_auth";
import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import {
  availableCapabilities,
  type CapabilityInventory,
  type EnvironmentSource,
} from "../capability_filter";
import {
  codexTurnMetadata,
  type PreferenceRuntime,
} from "../preferences/request_context";
import { ManualHandoff } from "../../commands/tab_control";
interface HandoffContext {
  runtime: EnvironmentSource & PreferenceRuntime;
  clientInfo: {
    type: string;
    name: string;
    capabilities?: CapabilityInventory;
  };
  acquireAuthority(): {
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  tabs: {
    get(tabId: number): Promise<unknown>;
    mark(tabId: number, status: string): Promise<unknown>;
  };
}
/** Original Ic. Preserve authorization before capability/client gates and tab validation. */
export const ManualHandoffCommand = defineCommand(
  ManualHandoff,
  async (payload: { tab_id: unknown }, context: HandoffContext) => {
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(Number(payload.tab_id)))
      .assert();
    const capabilities =
      availableCapabilities(context.runtime, context.clientInfo.capabilities)
        .tab ?? [];
    if (!(
      context.clientInfo.type === "cdp" &&
      capabilities.some(
        (capability) => capability.id === browserAuthTabCapabilityDefinition.id,
      )
    ))
      throw new Error(
        `${context.clientInfo.name} does not support command "${ManualHandoff.commandType}".`,
      );
    if (
      codexTurnMetadata(context.runtime)?.browser_auth_client_unsupported ===
      "true"
    )
      throw new Error(
        "This ChatGPT client does not support cloud browser takeover. Do not claim the handoff succeeded. Continue without handing off if possible. If the user explicitly requested takeover or the task cannot continue without it, briefly tell them to update the ChatGPT app.",
      );
    const tabId = positiveTabId(payload.tab_id);
    await context.tabs.get(tabId);
    await context.tabs.mark(tabId, "handoff");
    return {};
  },
);
/** Original ON. ks family metadata is explicit until the complete browser-family catalog is assembled. */
export function createMarkTabCommand(
  browserFamily: (info: any) => { displayName: string },
) {
  return defineCommand(
    "mark_tab",
    async (
      payload: { tab_id: unknown; status: string },
      context: {
        tabs: { mark(tabId: number, status: string): Promise<unknown> };
        clientInfo?: { type?: string; family?: string };
      },
    ) => {
      const tabId = positiveTabId(payload.tab_id);
      try {
        await context.tabs.mark(tabId, payload.status);
      } catch (error) {
        if (context.clientInfo?.type === "extension")
          throw new Error(
            `Please update the ChatGPT extension in ${browserFamily(context.clientInfo).displayName} to the latest version to continue.`,
            { cause: error },
          );
        throw error;
      }
      return {};
    },
  );
}
