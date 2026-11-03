import {
  availableCapabilities,
  type EnvironmentSource,
  type CapabilityInventory,
} from "./capability_filter";
export interface ProviderBrowserInfo {
  family?: string;
  name?: string;
  type: string;
  metadata?: {
    profileName?: string;
    extensionInstanceId?: string;
    codexSessionId?: string;
  };
  capabilities?: CapabilityInventory;
  apiSupportOverrides?: Record<string, boolean>;
  [key: string]: unknown;
}
/** Original Hy. Unknown provider types return undefined, not an invented fallback. */
export function publicBrowserType(type: string) {
  switch (type) {
    case "extension":
      return "extension";
    case "iab":
      return "iab";
    case "mcpapps":
      return "mcpapps";
    case "cdp":
      return "cdp";
  }
}
/** Original Sx. Metadata projection deliberately omits other provider metadata. */
export function browserSummary(id: string, info: ProviderBrowserInfo) {
  return {
    family: info.family,
    id,
    name: info.name,
    type: publicBrowserType(info.type),
    profileName: info.metadata?.profileName,
    metadata:
      info.metadata == null
        ? undefined
        : {
            extensionInstanceId: info.metadata.extensionInstanceId,
            codexSessionId: info.metadata.codexSessionId,
          },
  };
}
/** Original Go. CDP with an available browserAuth capability enables both handoff methods. */
export function browserDetails(
  runtime: EnvironmentSource,
  id: string,
  info: ProviderBrowserInfo,
) {
  const capabilities = availableCapabilities(runtime, info.capabilities),
    allowHandoff =
      info.type === "cdp" &&
      capabilities.tab?.some(({ id }) => id === "browserAuth") === true;
  return {
    ...browserSummary(id, info),
    apiSupportOverrides: allowHandoff
      ? {
          ...info.apiSupportOverrides,
          "Tab.requestManualHandoff": true,
          "Tab.requestUserTakeover": true,
        }
      : info.apiSupportOverrides,
    capabilities,
  };
}
