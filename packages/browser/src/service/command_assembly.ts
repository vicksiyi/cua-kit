import { assembleBrowserAuthHandoff } from "./browser_auth/handoff_assembly";
import {
  createServiceCommandRegistry,
  type ServiceCommand,
} from "./command_registry";
import { createCuaTypeCommand } from "./commands/coordinate_input";
import { createDomCuaTypeCommand } from "./commands/dom_input";
import { createLocatorFillCommand } from "./commands/locator_fill";
import { createTabBotDetectionReportCommand } from "./commands/bot_detection";
import { createWebMcpListToolsCommand } from "./commands/web_mcp";
/** Assembly of restored ug commands. Callers may supply a handoff or use assembleServiceCommandsWithBrowserAuth to construct it from restored modules. */
export function assembleServiceCommands(dependencies: {
  browserAuthHandoff: ServiceCommand;
  typeText: Parameters<typeof createCuaTypeCommand>[0];
  emitBotDetection: Parameters<typeof createTabBotDetectionReportCommand>[0];
  webMcp: Parameters<typeof createWebMcpListToolsCommand>[0];
}) {
  return createServiceCommandRegistry({
    BrowserAuthHandoffCommand: dependencies.browserAuthHandoff,
    CuaTypeCommand: createCuaTypeCommand(dependencies.typeText),
    DomCuaTypeCommand: createDomCuaTypeCommand(dependencies.typeText),
    PlaywrightLocatorFillCommand: createLocatorFillCommand(
      dependencies.typeText,
    ),
    TabBotDetectionReportCommand: createTabBotDetectionReportCommand(
      dependencies.emitBotDetection,
    ),
    WebMcpListToolsCommand: createWebMcpListToolsCommand(dependencies.webMcp),
  });
}

/** Assemble all registry entries, including the reconstructed authentication command. */
export function assembleServiceCommandsWithBrowserAuth(
  dependencies: Omit<
    Parameters<typeof assembleServiceCommands>[0],
    "browserAuthHandoff"
  > & {
    browserAuth: Parameters<typeof assembleBrowserAuthHandoff>[0];
  },
) {
  return assembleServiceCommands({
    ...dependencies,
    browserAuthHandoff: assembleBrowserAuthHandoff(dependencies.browserAuth),
  });
}
