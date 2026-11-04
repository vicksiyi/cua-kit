import {
  createDocumentedCommandRuntimeFactory,
  type CommandRuntimeDependencies,
} from "./command_runtime";
import {
  assembleBrowserContext,
  type BrowserContextHost,
} from "../context/browser_context_assembly";
import { assembleServiceCommandsWithBrowserAuth } from "../command_assembly";
import type { DocumentationBundle } from "../context/documentation";
import { disabledApiMembers } from "../capability_filter";
import { codexTurnMetadata } from "../preferences/request_context";
import { browserInventoryCommands } from "../commands/browser_inventory";
import {
  oncePerConversationBackend,
  browserUsageMetadata,
} from "../commands/bot_detection";
import { PlaywrightWaitForDownloadCommand } from "../commands/downloads";
import {
  BrowserUserClaimTabCommand,
  BrowserUserGetTabContextCommand,
} from "../commands/browser_user";
import { ManualHandoffCommand } from "../commands/handoff";
import { GetTabCommand } from "../commands/tabs";
import { WebMcpInvokeToolCommand } from "../commands/web_mcp";
import { findSessionWebMcpTool } from "../webmcp/session_catalog";
import { createWebMcpNotifications } from "../webmcp/notifications";
import { createBrowserNotificationQueue } from "../webmcp/notification_queue";
import { initializeAccessibilityCore } from "../accessibility/capture_manager";
import { approvalRuntime } from "../security/approval";
import {
  surfaceForBackend,
  assertBrowserSurfaceEnabled,
} from "./surface_policy";
import { commandScheduling } from "./command_scheduler";
/** Original Wy; family aliases and Dot are resolved elsewhere. */
export function isBrowserBackendAlias(value: unknown) {
  return (
    value === "extension" ||
    value === "iab" ||
    value === "cdp" ||
    value === "mcpapps"
  );
}
/** Original vh, distinct from client-bundle symbols with the same minified name. */
export function browserTelemetryAttributes(info: any) {
  return {
    backend: info.type,
    browser_family:
      info.type === "extension" ? (info.family ?? "unknown") : "not_applicable",
  };
}
export interface CommandRuntimeAssemblyOptions {
  context: BrowserContextHost;
  commands: Parameters<typeof assembleServiceCommandsWithBrowserAuth>[0];
  documentation: { moduleUrl: string; bundle?: DocumentationBundle };
  telemetry: Pick<
    CommandRuntimeDependencies,
    | "setExceptionReporter"
    | "configureRuntimeTelemetry"
    | "emitEvent"
    | "reportNotificationError"
    | "configureBackendTelemetry"
    | "configureTurnTelemetry"
  >;
}
/** Connects restored command registry, context, notifications, metadata and policies.
 * Host still supplies injected source, localization, telemetry SDK, feature/config services and auth integrations. */
export function assembleCommandRuntime(options: CommandRuntimeAssemblyOptions) {
  const commands = assembleServiceCommandsWithBrowserAuth(options.commands);
  const notices = createWebMcpNotifications(options.commands.webMcp);
  const queue = createBrowserNotificationQueue({
    collectors: [notices.collect],
    canObserve: commandScheduling.canObserve,
    canPublish: commandScheduling.shouldEmitResponseMetadata,
  });
  return createDocumentedCommandRuntimeFactory(
    {
      ...options.telemetry,
      setSecurityCheckReporter: approvalRuntime.setAuditSink,
      collectNotifications: queue.flush,
      trackRecordingContext: queue.enqueue,
      disabledApiMembers,
      createBackendSessionReporter: oncePerConversationBackend,
      readRequestMetadata: codexTurnMetadata,
      managementCommands: browserInventoryCommands,
      surfaceForBackend,
      isBrowserAlias: isBrowserBackendAlias,
      assertSurfaceEnabled: assertBrowserSurfaceEnabled,
      BrowserContext: assembleBrowserContext(options.context),
      browserCommands: commands.commands,
      telemetryTurnIds: browserUsageMetadata,
      browserTelemetryAttributes,
      downloadCommand: PlaywrightWaitForDownloadCommand,
      claimTabCommand: BrowserUserClaimTabCommand,
      getUserTabContextCommand: BrowserUserGetTabContextCommand,
      webMcpCallCommand: WebMcpInvokeToolCommand,
      lookupWebMcpTool: findSessionWebMcpTool,
      initializeAccessibility: initializeAccessibilityCore,
      manualHandoffCommand: ManualHandoffCommand,
      getTabCommand: GetTabCommand,
    },
    options.documentation.moduleUrl,
    options.documentation.bundle,
  );
}
