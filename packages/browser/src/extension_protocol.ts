// Browser-safe shared protocol definitions; extension backends use the same schemas as clients.
export {
  ManagementCallCommand,
  ManagementAuditTrailCommand,
  ViewportSetCommand,
  ViewportResetCommand,
  BrowserManagementCommands,
  BrowserViewportCommands,
} from "./commands/browser_capabilities";
export {
  managementBrowserCapabilityDefinition,
  viewportBrowserCapabilityDefinition,
} from "./capabilities/browser";
export { pageAssetsTabCapabilityDefinition } from "./capabilities/tab_page_assets";
export { webMcpTabCapabilityInfo } from "./capabilities/tab_web_mcp";
