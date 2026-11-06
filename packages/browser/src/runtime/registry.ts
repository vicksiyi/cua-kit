import { siwcTabCapabilityDefinition } from "../capabilities/tab_siwc";
import * as ax from "../ax";
import * as agent from "../agent";
import * as dialogs from "../dialogs";
import * as commands_command from "../commands/command";
import * as browser from "../browser";
import * as browser_user from "../browser_user";
import * as commands_browser_capabilities from "../commands/browser_capabilities";
import * as cua from "../cua";
import * as commands_index from "../commands/index";
import * as content from "../content";
import * as dom_cua from "../dom_cua";
import * as runtime_function_agent_transport from "../runtime/function_agent_transport";
import * as capabilities_browser from "../capabilities/browser";
import * as playwright_api from "../playwright/api";
import * as playwright_download from "../playwright/download";
import * as playwright_file_chooser from "../playwright/file_chooser";
import * as playwright_frame_locator from "../playwright/frame_locator";
import * as playwright_locator from "../playwright/locator";
import * as capabilities_tab from "../capabilities/tab";
import * as tab from "../tab";
import * as tabs from "../tabs";
import * as clipboard from "../clipboard";
import * as dev from "../dev";
import * as commands_tab_developer from "../commands/tab_developer";
import * as commands_browser_auth from "../commands/browser_auth";
import * as commands_page_assets from "../commands/page_assets";
import * as runtime_object_utils from "../runtime/object_utils";
import * as runtime_request_id from "../runtime/request_id";
import * as capabilities_tab_bot_detection from "../capabilities/tab_bot_detection";
import * as capabilities_tab_cdp from "../capabilities/tab_cdp";
import * as capabilities_tab_browser_auth from "../capabilities/tab_browser_auth";
import * as capabilities_tab_page_assets from "../capabilities/tab_page_assets";
import * as capabilities_tab_web_mcp from "../capabilities/tab_web_mcp";

/** Original p. Plain-object prototype and getter-only registry exports retained. */
export const runtimeTypes = {
  get AXAPI() {
    return ax.AxClient;
  },
  get Agent() {
    return agent.Agent;
  },
  get AlertDialog() {
    return dialogs.AlertDialog;
  },
  get AtlasCommand() {
    return commands_command.Command;
  },
  get BeforeUnloadDialog() {
    return dialogs.BeforeUnloadDialog;
  },
  get BotDetectionTabCapability() {
    return capabilities_tab_bot_detection.BotDetectionTabCapability;
  },
  get Browser() {
    return browser.Browser;
  },
  get BrowserAuthTabCapability() {
    return capabilities_tab_browser_auth.BrowserAuthTabCapability;
  },
  get BrowserManagementCommands() {
    return commands_browser_capabilities.BrowserManagementCommands;
  },
  get BrowserUser() {
    return browser_user.BrowserUser;
  },
  get BrowserViewportCommands() {
    return commands_browser_capabilities.BrowserViewportCommands;
  },
  get BrowserVisibilityCommands() {
    return commands_browser_capabilities.BrowserVisibilityCommands;
  },
  get Browsers() {
    return agent.Browsers;
  },
  get CUAAPI() {
    return cua.CUAAPI;
  },
  get CdpTabCapability() {
    return capabilities_tab_cdp.CdpTabCapability;
  },
  get Commands() {
    return commands_index.Commands;
  },
  get ConfirmDialog() {
    return dialogs.ConfirmDialog;
  },
  get ContentAPI() {
    return content.ContentAPI;
  },
  get Documentation() {
    return agent.Documentation;
  },
  get DomCUAAPI() {
    return dom_cua.DomCUAAPI;
  },
  get FunctionAgentTransport() {
    return runtime_function_agent_transport.FunctionAgentTransport;
  },
  get ManagementBrowserCapability() {
    return capabilities_browser.ManagementBrowserCapability;
  },
  get PageAssetsTabCapability() {
    return capabilities_tab_page_assets.PageAssetsTabCapability;
  },
  get PlaywrightAPI() {
    return playwright_api.PlaywrightAPI;
  },
  get PlaywrightDownload() {
    return playwright_download.PlaywrightDownload;
  },
  get PlaywrightFileChooser() {
    return playwright_file_chooser.PlaywrightFileChooser;
  },
  get PlaywrightFrameLocator() {
    return playwright_frame_locator.PlaywrightFrameLocator;
  },
  get PlaywrightLocator() {
    return playwright_locator.PlaywrightLocator;
  },
  get PromptDialog() {
    return dialogs.PromptDialog;
  },
  get Tab() {
    return tab.Tab;
  },
  get TabBotDetectionCommands() {
    return commands_tab_developer.TabBotDetectionCommands;
  },
  get TabBrowserAuthCommands() {
    return commands_browser_auth.TabBrowserAuthCommands;
  },
  get TabCdpCommands() {
    return commands_tab_developer.TabCdpCommands;
  },
  get TabClipboardAPI() {
    return clipboard.TabClipboardAPI;
  },
  get TabDevAPI() {
    return dev.TabDevAPI;
  },
  get TabPageAssetsCommands() {
    return commands_page_assets.TabPageAssetsCommands;
  },
  get TabWebMcpCapability() {
    return capabilities_tab_web_mcp.TabWebMcpCapability;
  },
  get Tabs() {
    return tabs.Tabs;
  },
  get ViewportBrowserCapability() {
    return capabilities_browser.ViewportBrowserCapability;
  },
  get VisibilityBrowserCapability() {
    return capabilities_browser.VisibilityBrowserCapability;
  },
  get botDetectionTabCapabilityDefinition() {
    return capabilities_tab_bot_detection.botDetectionTabCapabilityDefinition;
  },
  get browserAuthTabCapabilityDefinition() {
    return capabilities_tab_browser_auth.browserAuthTabCapabilityDefinition;
  },
  get browserCapabilityDefinitions() {
    return capabilities_browser.browserCapabilityDefinitions;
  },
  get cdpTabCapabilityDefinition() {
    return capabilities_tab_cdp.cdpTabCapabilityDefinition;
  },
  get generateRequestId() {
    return runtime_request_id.generateRequestId;
  },
  get hasErrorMessage() {
    return runtime_object_utils.hasErrorMessage;
  },
  get isPlainObject() {
    return runtime_object_utils.isPlainObject;
  },
  get isRegExp() {
    return runtime_object_utils.isRegExp;
  },
  get managementBrowserCapabilityDefinition() {
    return capabilities_browser.managementBrowserCapabilityDefinition;
  },
  get pageAssetsTabCapabilityDefinition() {
    return capabilities_tab_page_assets.pageAssetsTabCapabilityDefinition;
  },
  get siwcTabCapabilityDefinition() {
    return siwcTabCapabilityDefinition;
  },
  get tabCapabilityDefinitions() {
    return capabilities_tab.tabCapabilityDefinitions;
  },
  get toWebMcpToolDescriptor() {
    return capabilities_tab_web_mcp.toWebMcpToolDescriptor;
  },
  get viewportBrowserCapabilityDefinition() {
    return capabilities_browser.viewportBrowserCapabilityDefinition;
  },
  get visibilityBrowserCapabilityDefinition() {
    return capabilities_browser.visibilityBrowserCapabilityDefinition;
  },
  get webMcpTabCapabilityDefinition() {
    return capabilities_tab_web_mcp.webMcpTabCapabilityDefinition;
  },
  get webMcpTabCapabilityInfo() {
    return capabilities_tab_web_mcp.webMcpTabCapabilityInfo;
  },
};
for (const key of Object.keys(runtimeTypes))
  Object.defineProperty(runtimeTypes, key, { configurable: false });
