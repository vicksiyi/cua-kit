import { cdpTabCapabilityDefinition } from "./tab_cdp";
import { botDetectionTabCapabilityDefinition } from "./tab_bot_detection";
import { browserAuthTabCapabilityDefinition } from "./tab_browser_auth";
import { pageAssetsTabCapabilityDefinition } from "./tab_page_assets";
import { webMcpTabCapabilityDefinition } from "./tab_web_mcp";
import type { TabCapability, TabCapabilityOptions } from "./base";
/** Original gh/wh. Registration order and factory references are retained. */
export const tabCapabilityDefinitions = [
  cdpTabCapabilityDefinition,
  botDetectionTabCapabilityDefinition,
  browserAuthTabCapabilityDefinition,
  pageAssetsTabCapabilityDefinition,
  webMcpTabCapabilityDefinition,
];
export const tabCapabilityFactories = new Map<
  string,
  (options: TabCapabilityOptions) => TabCapability
>(
  tabCapabilityDefinitions.map((definition) => [
    definition.id,
    definition.create,
  ]),
);
