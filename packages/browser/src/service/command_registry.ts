import { SiwcAuthenticateCommand, SiwcDetectCommand } from "./commands/siwc";
/** Original ug/l6. All required host-bound commands must be supplied; no placeholder handlers. */
import {
  BrowserUserClaimTabCommand,
  BrowserUserGetTabContextCommand,
  BrowserUserHistoryCommand,
  BrowserUserOpenTabsCommand,
} from "./commands/browser_user";
import {
  CloseTabCommand,
  CreateTabCommand,
  GetTabCommand,
  ListTabsCommand,
  NameSessionCommand,
  SelectedTabCommand,
} from "./commands/tabs";
import {
  CuaClickCommand,
  CuaDoubleClickCommand,
  CuaDragCommand,
  CuaKeypressCommand,
  CuaMoveCommand,
  CuaScrollCommand,
} from "./commands/coordinate_input";
import {
  DomCuaClickCommand,
  DomCuaDoubleClickCommand,
  DomCuaKeypressCommand,
  DomCuaScrollCommand,
} from "./commands/dom_input";
import { DomCuaGetVisibleDomCommand } from "./input/visible_dom";
import { ManualHandoffCommand, MarkTabCommand } from "./commands/handoff";
import {
  NavigateTabBackCommand,
  NavigateTabForwardCommand,
  NavigateTabReloadCommand,
} from "./commands/history_navigation";
import { NavigateTabUrlCommand } from "./commands/navigate_url";
import { PlaywrightDomSnapshotCommand } from "./commands/dom_snapshot";
import {
  PlaywrightDownloadPathCommand,
  PlaywrightWaitForDownloadCommand,
} from "./commands/downloads";
import { PlaywrightEvaluateCommand } from "./commands/readonly_evaluate";
import {
  PlaywrightFileChooserSetFilesCommand,
  PlaywrightWaitForFileChooserCommand,
} from "./commands/file_chooser";
import {
  PlaywrightLocatorAllTextContentsCommand,
  PlaywrightLocatorClickCommand,
  PlaywrightLocatorCountCommand,
  PlaywrightLocatorDblclickCommand,
  PlaywrightLocatorGetAttributeCommand,
  PlaywrightLocatorInnerTextCommand,
  PlaywrightLocatorIsEnabledCommand,
  PlaywrightLocatorIsVisibleCommand,
  PlaywrightLocatorReadAllCommand,
  PlaywrightLocatorTextContentCommand,
  PlaywrightLocatorWaitForCommand,
} from "./commands/locator";
import { PlaywrightLocatorDownloadMediaCommand } from "./commands/download_media";
import { PlaywrightLocatorPressCommand } from "./commands/locator_press";
import {
  PlaywrightLocatorPressSequentiallyCommand,
  PlaywrightLocatorSelectOptionCommand,
  PlaywrightLocatorSetCheckedCommand,
} from "./commands/locator_actions";
import {
  PlaywrightWaitForLoadStateCommand,
  PlaywrightWaitForTimeoutCommand,
  PlaywrightWaitForUrlCommand as PlaywrightWaitForURLCommand,
} from "./commands/wait";
import {
  TabAXActionCommand as TabAxActionCommand,
  TabAXGetStateCommand as TabAxGetStateCommand,
} from "./commands/accessibility";
import { TabCdpCallCommand, TabCdpEventsCommand } from "./commands/raw_cdp";
import {
  TabClipboardReadCommand,
  TabClipboardReadTextCommand,
  TabClipboardWriteCommand,
  TabClipboardWriteTextCommand,
} from "./commands/clipboard";
import { TabContentExportGSuiteCommand } from "./commands/content_export";
import { TabContentExportYouTubeTranscriptCommand } from "./commands/youtube_export";
import { TabDevLogsCommand } from "./commands/dev_logs";
import {
  TabGetJsDialogCommand,
  TabHandleJsDialogCommand,
} from "./commands/dialog";
import {
  TabPageAssetsBundleCommand,
  TabPageAssetsListCommand,
} from "./commands/page_assets";
import { TabScreenshotCommand } from "./commands/screenshot";
import { WebMcpInvokeToolCommand } from "./commands/web_mcp";

export type ServiceCommand = ((payload: any, context: any) => any) & {
  type: string;
};
export interface HostBoundCommands {
  BrowserAuthHandoffCommand: ServiceCommand;
  CuaTypeCommand: ServiceCommand;
  DomCuaTypeCommand: ServiceCommand;
  PlaywrightLocatorFillCommand: ServiceCommand;
  TabBotDetectionReportCommand: ServiceCommand;
  WebMcpListToolsCommand: ServiceCommand;
}
export function createServiceCommandRegistry(host: HostBoundCommands) {
  const registry = Object.defineProperties(
    {},
    {
      BrowserAuthHandoffCommand: {
        enumerable: true,
        get: () => host.BrowserAuthHandoffCommand,
      },
      BrowserUserClaimTabCommand: {
        enumerable: true,
        get: () => BrowserUserClaimTabCommand,
      },
      BrowserUserGetTabContextCommand: {
        enumerable: true,
        get: () => BrowserUserGetTabContextCommand,
      },
      BrowserUserHistoryCommand: {
        enumerable: true,
        get: () => BrowserUserHistoryCommand,
      },
      BrowserUserOpenTabsCommand: {
        enumerable: true,
        get: () => BrowserUserOpenTabsCommand,
      },
      CloseTabCommand: { enumerable: true, get: () => CloseTabCommand },
      CreateTabCommand: { enumerable: true, get: () => CreateTabCommand },
      CuaClickCommand: { enumerable: true, get: () => CuaClickCommand },
      CuaDoubleClickCommand: {
        enumerable: true,
        get: () => CuaDoubleClickCommand,
      },
      CuaDragCommand: { enumerable: true, get: () => CuaDragCommand },
      CuaKeypressCommand: { enumerable: true, get: () => CuaKeypressCommand },
      CuaMoveCommand: { enumerable: true, get: () => CuaMoveCommand },
      CuaScrollCommand: { enumerable: true, get: () => CuaScrollCommand },
      CuaTypeCommand: { enumerable: true, get: () => host.CuaTypeCommand },
      DomCuaClickCommand: { enumerable: true, get: () => DomCuaClickCommand },
      DomCuaDoubleClickCommand: {
        enumerable: true,
        get: () => DomCuaDoubleClickCommand,
      },
      DomCuaGetVisibleDomCommand: {
        enumerable: true,
        get: () => DomCuaGetVisibleDomCommand,
      },
      DomCuaKeypressCommand: {
        enumerable: true,
        get: () => DomCuaKeypressCommand,
      },
      DomCuaScrollCommand: { enumerable: true, get: () => DomCuaScrollCommand },
      DomCuaTypeCommand: {
        enumerable: true,
        get: () => host.DomCuaTypeCommand,
      },
      GetTabCommand: { enumerable: true, get: () => GetTabCommand },
      ListTabsCommand: { enumerable: true, get: () => ListTabsCommand },
      ManualHandoffCommand: {
        enumerable: true,
        get: () => ManualHandoffCommand,
      },
      MarkTabCommand: { enumerable: true, get: () => MarkTabCommand },
      NameSessionCommand: { enumerable: true, get: () => NameSessionCommand },
      NavigateTabBackCommand: {
        enumerable: true,
        get: () => NavigateTabBackCommand,
      },
      NavigateTabForwardCommand: {
        enumerable: true,
        get: () => NavigateTabForwardCommand,
      },
      NavigateTabReloadCommand: {
        enumerable: true,
        get: () => NavigateTabReloadCommand,
      },
      NavigateTabUrlCommand: {
        enumerable: true,
        get: () => NavigateTabUrlCommand,
      },
      PlaywrightDomSnapshotCommand: {
        enumerable: true,
        get: () => PlaywrightDomSnapshotCommand,
      },
      PlaywrightDownloadPathCommand: {
        enumerable: true,
        get: () => PlaywrightDownloadPathCommand,
      },
      PlaywrightEvaluateCommand: {
        enumerable: true,
        get: () => PlaywrightEvaluateCommand,
      },
      PlaywrightFileChooserSetFilesCommand: {
        enumerable: true,
        get: () => PlaywrightFileChooserSetFilesCommand,
      },
      PlaywrightLocatorAllTextContentsCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorAllTextContentsCommand,
      },
      PlaywrightLocatorClickCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorClickCommand,
      },
      PlaywrightLocatorCountCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorCountCommand,
      },
      PlaywrightLocatorDblclickCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorDblclickCommand,
      },
      PlaywrightLocatorDownloadMediaCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorDownloadMediaCommand,
      },
      PlaywrightLocatorFillCommand: {
        enumerable: true,
        get: () => host.PlaywrightLocatorFillCommand,
      },
      PlaywrightLocatorGetAttributeCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorGetAttributeCommand,
      },
      PlaywrightLocatorInnerTextCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorInnerTextCommand,
      },
      PlaywrightLocatorIsEnabledCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorIsEnabledCommand,
      },
      PlaywrightLocatorIsVisibleCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorIsVisibleCommand,
      },
      PlaywrightLocatorPressCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorPressCommand,
      },
      PlaywrightLocatorPressSequentiallyCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorPressSequentiallyCommand,
      },
      PlaywrightLocatorReadAllCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorReadAllCommand,
      },
      PlaywrightLocatorSelectOptionCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorSelectOptionCommand,
      },
      PlaywrightLocatorSetCheckedCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorSetCheckedCommand,
      },
      PlaywrightLocatorTextContentCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorTextContentCommand,
      },
      PlaywrightLocatorWaitForCommand: {
        enumerable: true,
        get: () => PlaywrightLocatorWaitForCommand,
      },
      PlaywrightWaitForDownloadCommand: {
        enumerable: true,
        get: () => PlaywrightWaitForDownloadCommand,
      },
      PlaywrightWaitForFileChooserCommand: {
        enumerable: true,
        get: () => PlaywrightWaitForFileChooserCommand,
      },
      PlaywrightWaitForLoadStateCommand: {
        enumerable: true,
        get: () => PlaywrightWaitForLoadStateCommand,
      },
      PlaywrightWaitForTimeoutCommand: {
        enumerable: true,
        get: () => PlaywrightWaitForTimeoutCommand,
      },
      PlaywrightWaitForURLCommand: {
        enumerable: true,
        get: () => PlaywrightWaitForURLCommand,
      },
      SelectedTabCommand: { enumerable: true, get: () => SelectedTabCommand },
      SiwcAuthenticateCommand: {
        enumerable: true,
        get: () => SiwcAuthenticateCommand,
      },
      SiwcDetectCommand: { enumerable: true, get: () => SiwcDetectCommand },
      TabAxActionCommand: { enumerable: true, get: () => TabAxActionCommand },
      TabAxGetStateCommand: {
        enumerable: true,
        get: () => TabAxGetStateCommand,
      },
      TabBotDetectionReportCommand: {
        enumerable: true,
        get: () => host.TabBotDetectionReportCommand,
      },
      TabCdpCallCommand: { enumerable: true, get: () => TabCdpCallCommand },
      TabCdpEventsCommand: { enumerable: true, get: () => TabCdpEventsCommand },
      TabClipboardReadCommand: {
        enumerable: true,
        get: () => TabClipboardReadCommand,
      },
      TabClipboardReadTextCommand: {
        enumerable: true,
        get: () => TabClipboardReadTextCommand,
      },
      TabClipboardWriteCommand: {
        enumerable: true,
        get: () => TabClipboardWriteCommand,
      },
      TabClipboardWriteTextCommand: {
        enumerable: true,
        get: () => TabClipboardWriteTextCommand,
      },
      TabContentExportGSuiteCommand: {
        enumerable: true,
        get: () => TabContentExportGSuiteCommand,
      },
      TabContentExportYouTubeTranscriptCommand: {
        enumerable: true,
        get: () => TabContentExportYouTubeTranscriptCommand,
      },
      TabDevLogsCommand: { enumerable: true, get: () => TabDevLogsCommand },
      TabGetJsDialogCommand: {
        enumerable: true,
        get: () => TabGetJsDialogCommand,
      },
      TabHandleJsDialogCommand: {
        enumerable: true,
        get: () => TabHandleJsDialogCommand,
      },
      TabPageAssetsBundleCommand: {
        enumerable: true,
        get: () => TabPageAssetsBundleCommand,
      },
      TabPageAssetsListCommand: {
        enumerable: true,
        get: () => TabPageAssetsListCommand,
      },
      TabScreenshotCommand: {
        enumerable: true,
        get: () => TabScreenshotCommand,
      },
      WebMcpInvokeToolCommand: {
        enumerable: true,
        get: () => WebMcpInvokeToolCommand,
      },
      WebMcpListToolsCommand: {
        enumerable: true,
        get: () => host.WebMcpListToolsCommand,
      },
    },
  ) as {
    readonly BrowserAuthHandoffCommand: ServiceCommand;
    readonly BrowserUserClaimTabCommand: ServiceCommand;
    readonly BrowserUserGetTabContextCommand: ServiceCommand;
    readonly BrowserUserHistoryCommand: ServiceCommand;
    readonly BrowserUserOpenTabsCommand: ServiceCommand;
    readonly CloseTabCommand: ServiceCommand;
    readonly CreateTabCommand: ServiceCommand;
    readonly CuaClickCommand: ServiceCommand;
    readonly CuaDoubleClickCommand: ServiceCommand;
    readonly CuaDragCommand: ServiceCommand;
    readonly CuaKeypressCommand: ServiceCommand;
    readonly CuaMoveCommand: ServiceCommand;
    readonly CuaScrollCommand: ServiceCommand;
    readonly CuaTypeCommand: ServiceCommand;
    readonly DomCuaClickCommand: ServiceCommand;
    readonly DomCuaDoubleClickCommand: ServiceCommand;
    readonly DomCuaGetVisibleDomCommand: ServiceCommand;
    readonly DomCuaKeypressCommand: ServiceCommand;
    readonly DomCuaScrollCommand: ServiceCommand;
    readonly DomCuaTypeCommand: ServiceCommand;
    readonly GetTabCommand: ServiceCommand;
    readonly ListTabsCommand: ServiceCommand;
    readonly ManualHandoffCommand: ServiceCommand;
    readonly MarkTabCommand: ServiceCommand;
    readonly NameSessionCommand: ServiceCommand;
    readonly NavigateTabBackCommand: ServiceCommand;
    readonly NavigateTabForwardCommand: ServiceCommand;
    readonly NavigateTabReloadCommand: ServiceCommand;
    readonly NavigateTabUrlCommand: ServiceCommand;
    readonly PlaywrightDomSnapshotCommand: ServiceCommand;
    readonly PlaywrightDownloadPathCommand: ServiceCommand;
    readonly PlaywrightEvaluateCommand: ServiceCommand;
    readonly PlaywrightFileChooserSetFilesCommand: ServiceCommand;
    readonly PlaywrightLocatorAllTextContentsCommand: ServiceCommand;
    readonly PlaywrightLocatorClickCommand: ServiceCommand;
    readonly PlaywrightLocatorCountCommand: ServiceCommand;
    readonly PlaywrightLocatorDblclickCommand: ServiceCommand;
    readonly PlaywrightLocatorDownloadMediaCommand: ServiceCommand;
    readonly PlaywrightLocatorFillCommand: ServiceCommand;
    readonly PlaywrightLocatorGetAttributeCommand: ServiceCommand;
    readonly PlaywrightLocatorInnerTextCommand: ServiceCommand;
    readonly PlaywrightLocatorIsEnabledCommand: ServiceCommand;
    readonly PlaywrightLocatorIsVisibleCommand: ServiceCommand;
    readonly PlaywrightLocatorPressCommand: ServiceCommand;
    readonly PlaywrightLocatorPressSequentiallyCommand: ServiceCommand;
    readonly PlaywrightLocatorReadAllCommand: ServiceCommand;
    readonly PlaywrightLocatorSelectOptionCommand: ServiceCommand;
    readonly PlaywrightLocatorSetCheckedCommand: ServiceCommand;
    readonly PlaywrightLocatorTextContentCommand: ServiceCommand;
    readonly PlaywrightLocatorWaitForCommand: ServiceCommand;
    readonly PlaywrightWaitForDownloadCommand: ServiceCommand;
    readonly PlaywrightWaitForFileChooserCommand: ServiceCommand;
    readonly PlaywrightWaitForLoadStateCommand: ServiceCommand;
    readonly PlaywrightWaitForTimeoutCommand: ServiceCommand;
    readonly PlaywrightWaitForURLCommand: ServiceCommand;
    readonly SelectedTabCommand: ServiceCommand;
    readonly SiwcAuthenticateCommand: ServiceCommand;
    readonly SiwcDetectCommand: ServiceCommand;
    readonly TabAxActionCommand: ServiceCommand;
    readonly TabAxGetStateCommand: ServiceCommand;
    readonly TabBotDetectionReportCommand: ServiceCommand;
    readonly TabCdpCallCommand: ServiceCommand;
    readonly TabCdpEventsCommand: ServiceCommand;
    readonly TabClipboardReadCommand: ServiceCommand;
    readonly TabClipboardReadTextCommand: ServiceCommand;
    readonly TabClipboardWriteCommand: ServiceCommand;
    readonly TabClipboardWriteTextCommand: ServiceCommand;
    readonly TabContentExportGSuiteCommand: ServiceCommand;
    readonly TabContentExportYouTubeTranscriptCommand: ServiceCommand;
    readonly TabDevLogsCommand: ServiceCommand;
    readonly TabGetJsDialogCommand: ServiceCommand;
    readonly TabHandleJsDialogCommand: ServiceCommand;
    readonly TabPageAssetsBundleCommand: ServiceCommand;
    readonly TabPageAssetsListCommand: ServiceCommand;
    readonly TabScreenshotCommand: ServiceCommand;
    readonly WebMcpInvokeToolCommand: ServiceCommand;
    readonly WebMcpListToolsCommand: ServiceCommand;
  };
  return { registry, commands: Object.values(registry) };
}
