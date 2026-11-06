import * as siwc from "./siwc";
import * as command from "./command";
import * as browser_user from "./browser_user";
import * as browser_session from "./browser_session";
import * as browser_inventory from "./browser_inventory";
import * as cua_input from "./cua_input";
import * as tab_control from "./tab_control";
import * as tabs from "./tabs";
import * as playwright_locator from "./playwright_locator";
import * as playwright_page from "./playwright_page";
import * as playwright_read_all from "./playwright_read_all";
import * as runtime_config from "./runtime_config";
import * as web_mcp from "./web_mcp";
import * as ax from "./ax";
import * as tab_services from "./tab_services";

/** Original b. Getter-only namespace keys in the original order. */
export const Commands = {
  get AtlasCommand() {
    return command.Command;
  },
  get BrowserUserClaimTab() {
    return browser_user.UserClaimTabCommand;
  },
  get BrowserUserGetTabContext() {
    return browser_user.UserGetTabContextCommand;
  },
  get BrowserUserHistory() {
    return browser_session.BrowserHistory;
  },
  get BrowserUserOpenTabs() {
    return browser_user.UserOpenTabsCommand;
  },
  get CloseTab() {
    return tab_control.CloseTab;
  },
  get CreateTab() {
    return tabs.CreateTabCommand;
  },
  get CuaClick() {
    return cua_input.CuaClick;
  },
  get CuaDoubleClick() {
    return cua_input.CuaDoubleClick;
  },
  get CuaDownloadMedia() {
    return cua_input.CuaDownloadMedia;
  },
  get CuaDrag() {
    return cua_input.CuaDrag;
  },
  get CuaKeypress() {
    return cua_input.CuaKeypress;
  },
  get CuaMove() {
    return cua_input.CuaMove;
  },
  get CuaScroll() {
    return cua_input.CuaScroll;
  },
  get CuaType() {
    return cua_input.CuaType;
  },
  get DomCuaClick() {
    return cua_input.DomCuaClick;
  },
  get DomCuaDoubleClick() {
    return cua_input.DomCuaDoubleClick;
  },
  get DomCuaDownloadMedia() {
    return cua_input.DomCuaDownloadMedia;
  },
  get DomCuaGetVisibleDom() {
    return cua_input.DomCuaGetVisibleDom;
  },
  get DomCuaKeypress() {
    return cua_input.DomCuaKeypress;
  },
  get DomCuaScroll() {
    return cua_input.DomCuaScroll;
  },
  get DomCuaType() {
    return cua_input.DomCuaType;
  },
  get GetBrowser() {
    return browser_inventory.GetBrowserCommand;
  },
  get GetBrowserDocumentation() {
    return browser_session.BrowserDocumentation;
  },
  get GetBrowserForUrl() {
    return browser_inventory.GetBrowserForUrlCommand;
  },
  get GetDefaultBrowser() {
    return browser_inventory.GetDefaultBrowserCommand;
  },
  get GetDocumentation() {
    return browser_inventory.GetDocumentationCommand;
  },
  get GetTab() {
    return tabs.GetTabCommand;
  },
  get ListBrowsers() {
    return browser_inventory.ListBrowsersCommand;
  },
  get ListTabs() {
    return tabs.ListTabsCommand;
  },
  get ManualHandoff() {
    return tab_control.ManualHandoff;
  },
  get MarkTab() {
    return tab_control.MarkTab;
  },
  get NameSession() {
    return browser_session.NameSession;
  },
  get NavigateTab() {
    return tab_control.NavigateTab;
  },
  get NavigateTabBack() {
    return tab_control.NavigateTabBack;
  },
  get NavigateTabForward() {
    return tab_control.NavigateTabForward;
  },
  get NavigateTabReload() {
    return tab_control.NavigateTabReload;
  },
  get PlaywrightDomSnapshot() {
    return playwright_page.DomSnapshot;
  },
  get PlaywrightDownloadPath() {
    return playwright_page.DownloadPath;
  },
  get PlaywrightElementInfo() {
    return playwright_page.ElementInfo;
  },
  get PlaywrightElementScreenshot() {
    return playwright_page.ElementScreenshot;
  },
  get PlaywrightEvaluate() {
    return playwright_locator.PlaywrightEvaluate;
  },
  get PlaywrightFileChooserSetFiles() {
    return playwright_page.FileChooserSetFiles;
  },
  get PlaywrightLocatorAllTextContents() {
    return playwright_locator.LocatorAllTextContents;
  },
  get PlaywrightLocatorClick() {
    return playwright_locator.LocatorClick;
  },
  get PlaywrightLocatorCount() {
    return playwright_locator.LocatorCount;
  },
  get PlaywrightLocatorDblclick() {
    return playwright_locator.LocatorDoubleClick;
  },
  get PlaywrightLocatorDownloadMedia() {
    return playwright_locator.LocatorDownloadMedia;
  },
  get PlaywrightLocatorFill() {
    return playwright_locator.LocatorFill;
  },
  get PlaywrightLocatorGetAttribute() {
    return playwright_locator.LocatorGetAttribute;
  },
  get PlaywrightLocatorInnerText() {
    return playwright_locator.LocatorInnerText;
  },
  get PlaywrightLocatorIsEnabled() {
    return playwright_locator.LocatorIsEnabled;
  },
  get PlaywrightLocatorIsVisible() {
    return playwright_locator.LocatorIsVisible;
  },
  get PlaywrightLocatorPress() {
    return playwright_locator.LocatorPress;
  },
  get PlaywrightLocatorPressSequentially() {
    return playwright_locator.LocatorPressSequentially;
  },
  get PlaywrightLocatorReadAll() {
    return playwright_read_all.PlaywrightLocatorReadAll;
  },
  get PlaywrightLocatorSelectOption() {
    return playwright_locator.LocatorSelectOption;
  },
  get PlaywrightLocatorSetChecked() {
    return playwright_locator.LocatorSetChecked;
  },
  get PlaywrightLocatorTextContent() {
    return playwright_locator.LocatorTextContent;
  },
  get PlaywrightLocatorWaitFor() {
    return playwright_locator.LocatorWaitFor;
  },
  get PlaywrightWaitForDownload() {
    return playwright_page.WaitForDownload;
  },
  get PlaywrightWaitForFileChooser() {
    return playwright_page.WaitForFileChooser;
  },
  get PlaywrightWaitForLoadState() {
    return playwright_page.WaitForLoadState;
  },
  get PlaywrightWaitForTimeout() {
    return playwright_page.WaitForTimeout;
  },
  get PlaywrightWaitForURL() {
    return playwright_page.WaitForUrl;
  },
  get RuntimeConfig() {
    return runtime_config.RuntimeConfig;
  },
  get SelectedTab() {
    return tabs.SelectedTabCommand;
  },
  get SiwcAuthenticate() {
    return siwc.SiwcAuthenticate;
  },
  get SiwcDetect() {
    return siwc.SiwcDetect;
  },
  get TabAxAction() {
    return ax.ActionCommand;
  },
  get TabAxGetState() {
    return ax.StateCommand;
  },
  get TabClipboardRead() {
    return tab_services.ClipboardReadCommand;
  },
  get TabClipboardReadText() {
    return tab_services.ClipboardReadTextCommand;
  },
  get TabClipboardWrite() {
    return tab_services.ClipboardWriteCommand;
  },
  get TabClipboardWriteText() {
    return tab_services.ClipboardWriteTextCommand;
  },
  get TabContentExport() {
    return tab_services.ContentExportCommand;
  },
  get TabContentExportGSuite() {
    return tab_services.ContentExportGsuiteCommand;
  },
  get TabContentExportYouTubeTranscript() {
    return tab_services.ContentExportYouTubeTranscriptCommand;
  },
  get TabDevLogs() {
    return tab_services.DevLogsCommand;
  },
  get TabGetJsDialog() {
    return tab_control.TabGetJsDialog;
  },
  get TabHandleJsDialog() {
    return tab_control.TabHandleJsDialog;
  },
  get TabScreenshot() {
    return tab_control.TabScreenshot;
  },
  get TabsContent() {
    return tabs.TabsContentCommand;
  },
  get WebMcpInvokeTool() {
    return web_mcp.WebMcpInvokeTool;
  },
  get WebMcpListTools() {
    return web_mcp.WebMcpListTools;
  },
};
for (const key of Object.keys(Commands))
  Object.defineProperty(Commands, key, { configurable: false });
