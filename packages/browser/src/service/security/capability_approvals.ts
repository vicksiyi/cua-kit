import type { Preferences } from "../preferences/preferences";
import { AuthorityGateError } from "../errors/authority_gate_error";
import { downloadSourceOrigin } from "../context/downloads";
import { httpOrigin } from "./authority_builder";
import {
  approvalRuntime,
  browserDisplayName,
  savedPermissionApproval,
  approvalDecision,
} from "./approval";
type Getter = Parameters<typeof approvalRuntime.createElicitation>[0];
type Display = Parameters<typeof browserDisplayName>[0];
type Localize = (
  message: { id: string; defaultMessage: string; description: string },
  values?: Record<string, string>,
) => string;
type CapabilityPreferences = Pick<
  Preferences,
  | "getHistoryPermission"
  | "allowsGlobalPersistentApproval"
  | "handleHistoryPromptResult"
  | "getFileTransferPermission"
  | "isPersistentApprovalAllowed"
  | "handleFileTransferPromptResult"
  | "getFullCdpPermission"
  | "handleFullCdpPromptResult"
>;
/** Original LB/I_/WB. Preparation and user prompting remain separate phases. */
export function createCapabilityApprovals(runtime = approvalRuntime) {
  async function history(
    getElicitation: Getter,
    request: any,
    backend: string,
    preferences: CapabilityPreferences,
    display: Display = {},
    bypass = false,
  ) {
    const name = browserDisplayName(display);
    const permission = await preferences.getHistoryPermission(backend);
    const reused = savedPermissionApproval(
      { gate: "historyApproval" },
      permission,
    );
    if (reused != null && !bypass) return async () => reused;
    if (bypass) return async () => {};
    const ask = runtime.createElicitation(getElicitation, {
      gate: "historyApproval",
    });
    const persistent = await preferences.allowsGlobalPersistentApproval();
    return async () => {
      const result = await ask({
        message: `Allow ${name} to use your browsing history for this task?`,
        meta: {
          codex_approval_kind: "mcp_tool_call",
          connector_id: "browser-use",
          connector_name: name,
          ...(persistent ? { persist: "always" } : {}),
          subtitle:
            "ChatGPT can use records of pages visited, including from earlier sessions, to help with this task.",
          tool_params: request,
          sensitive_data: "browsing_history",
        },
      });
      await preferences.handleHistoryPromptResult(result, backend);
      return approvalDecision({ gate: "historyApproval" }, result);
    };
  }
  async function fileTransfer(
    getElicitation: Getter,
    direction: "download" | "upload",
    url: string,
    preferences: CapabilityPreferences,
    localize: Localize,
    display: Display = {},
  ) {
    const audit = { origin: httpOrigin(url) ?? undefined },
      name = browserDisplayName(display),
      origin = downloadSourceOrigin(url);
    if (origin == null)
      throw new AuthorityGateError(
        direction === "download" ? "downloadApproval" : "uploadApproval",
        "browser_context_unavailable",
        "The browser could not determine the origin for this operation.",
      );
    const permission = await preferences.getFileTransferPermission(
      direction,
      origin,
    );
    const context = {
      gate: direction === "download" ? "downloadApproval" : "uploadApproval",
      ...audit,
    };
    const reused = savedPermissionApproval(context, permission);
    if (reused != null) return async () => reused;
    const ask = runtime.createElicitation(getElicitation, context),
      persistent = await preferences.isPersistentApprovalAllowed(origin);
    return async () => {
      const result = await ask({
        message:
          direction === "download"
            ? localize(
                {
                  id: "browser.download.permission",
                  defaultMessage: "Allow download from {url}?",
                  description:
                    "Permission prompt asking whether to download a file. url is the page URL where the download starts.",
                },
                { url },
              )
            : `Allow upload to ${url}?`,
        meta: {
          codex_approval_kind: "mcp_tool_call",
          connector_id: "browser-use",
          connector_name: name,
          persist: persistent ? ["session", "always"] : "session",
          tool_name:
            direction === "download"
              ? "download_browser_files"
              : "upload_browser_files",
          tool_title:
            direction === "download"
              ? "Download browser files"
              : "Upload browser files",
          tool_params: { origin },
          file_transfer: direction,
          origin,
        },
      });
      await preferences.handleFileTransferPromptResult(
        direction,
        origin,
        result,
      );
      return approvalDecision(context, result);
    };
  }
  async function fullCdp(
    getElicitation: Getter,
    url: string,
    preferences: CapabilityPreferences,
    display: Display = {},
  ) {
    const name = browserDisplayName(display),
      origin = httpOrigin(url),
      audit = { origin: origin ?? undefined };
    if (origin == null)
      throw new AuthorityGateError(
        "fullCdpApproval",
        "browser_context_unavailable",
        "The browser could not determine the origin for this operation.",
      );
    const permission = await preferences.getFullCdpPermission(origin),
      context = { gate: "fullCdpApproval", ...audit },
      reused = savedPermissionApproval(context, permission);
    if (reused != null) return async () => reused;
    const ask = runtime.createElicitation(getElicitation, context),
      persistent = await preferences.isPersistentApprovalAllowed(origin);
    return async () => {
      const result = await ask({
        message: `Allow ${name} to use full Chrome Developer Tools access on ${origin}`,
        meta: {
          codex_approval_kind: "mcp_tool_call",
          connector_id: "browser-use",
          connector_name: name,
          persist: persistent ? "always" : undefined,
          riskLevel: "high",
          tool_name: "access_browser_origin_with_raw_cdp",
          tool_title: "Use raw CDP on browser origin",
          tool_params: { origin },
          tool_params_display: [],
          full_cdp_access: true,
          origin,
        },
      });
      await preferences.handleFullCdpPromptResult(origin, result);
      return approvalDecision(context, result);
    };
  }
  return { history, fileTransfer, fullCdp };
}
export const capabilityApprovals = createCapabilityApprovals();
