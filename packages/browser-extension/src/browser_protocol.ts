import {
  ManagementCallCommand,
  ManagementAuditTrailCommand,
  ViewportSetCommand,
  ViewportResetCommand,
  BrowserManagementCommands,
  BrowserViewportCommands,
  managementBrowserCapabilityDefinition,
  viewportBrowserCapabilityDefinition,
  pageAssetsTabCapabilityDefinition,
  webMcpTabCapabilityInfo,
} from "@core/browser/extensionProtocol";
import type { BrowserCommandDependencies } from "./command_handler";

/** Original Np/bc; declarations must be own properties, then a handler must exist. */
export async function dispatchExtensionCommand({
  backendName,
  commandSets,
  handlers,
  payload,
}: {
  backendName: string;
  commandSets: { commands: object }[];
  handlers: Record<string, ((payload: any) => unknown) | undefined>;
  payload: any;
}) {
  const unsupported = () =>
    new Error(`${backendName} does not support command "${payload.type}".`);
  if (
    !commandSets.some((set) =>
      Object.prototype.hasOwnProperty.call(set.commands, payload.type),
    )
  )
    throw unsupported();
  const handler = handlers[payload.type];
  if (handler == null) throw unsupported();
  return handler(payload);
}
export const extensionBrowserProtocol: Pick<
  BrowserCommandDependencies,
  | "dispatchCommand"
  | "commandSets"
  | "commandNames"
  | "schemas"
  | "capabilities"
> = {
  dispatchCommand: dispatchExtensionCommand,
  commandSets: [BrowserViewportCommands, BrowserManagementCommands],
  commandNames: {
    management: ManagementCallCommand.commandType,
    audit: ManagementAuditTrailCommand.commandType,
    setViewport: ViewportSetCommand.commandType,
    resetViewport: ViewportResetCommand.commandType,
  },
  schemas: {
    managementInput: ManagementCallCommand.PayloadSchema,
    managementOutput: ManagementCallCommand.ResultSchema,
    auditInput: ManagementAuditTrailCommand.PayloadSchema,
    auditOutput: ManagementAuditTrailCommand.ResultSchema,
    viewportInput: ViewportSetCommand.PayloadSchema,
    viewportOutput: ViewportSetCommand.ResultSchema,
    resetInput: ViewportResetCommand.PayloadSchema,
    resetOutput: ViewportResetCommand.ResultSchema,
  },
  capabilities: {
    browser: viewportBrowserCapabilityDefinition.info,
    management: managementBrowserCapabilityDefinition.info,
    pageAssets: pageAssetsTabCapabilityDefinition.info,
    tab: {
      id: "siwc",
      description:
        "Detect possible Sign in with ChatGPT controls and authenticate the user. Read its documentation before authenticating with the current account.",
    },
    webMcp: webMcpTabCapabilityInfo,
  },
};
