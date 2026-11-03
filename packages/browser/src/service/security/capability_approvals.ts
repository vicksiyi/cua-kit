import { WebMcpInvokeTool, WebMcpListTools } from "../../commands/web_mcp";
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
  async function assetOrigin(
    getElicitation: Getter,
    origin: string,
    message: string,
    preferences: CapabilityPreferences,
    localize: Localize,
    display: Display,
  ) {
    const audit = { origin: httpOrigin(origin) ?? undefined };
    const permission = await preferences.getFileTransferPermission(
      "download",
      origin,
    );
    const context = { gate: "downloadApproval", ...audit },
      reused = savedPermissionApproval(context, permission);
    if (reused != null) return async () => reused;
    const name = browserDisplayName(display),
      ask = runtime.createElicitation(getElicitation, context),
      persistent = await preferences.isPersistentApprovalAllowed(origin);
    return async () => {
      const result = await ask({
        message,
        meta: {
          codex_approval_kind: "mcp_tool_call",
          connector_id: "browser-use",
          connector_name: name,
          persist: persistent ? ["session", "always"] : "session",
          tool_params: { asset_origins: [origin] },
          tool_params_display: [
            {
              name: "asset_origins",
              display_name: localize({
                id: "browser.download.sourceLabel",
                defaultMessage: "Download from",
                description:
                  "Label before the website origin in a permission prompt to download assets from a webpage.",
              }),
              value: origin,
            },
          ],
        },
      });
      await preferences.handleFileTransferPromptResult(
        "download",
        origin,
        result,
      );
      return approvalDecision(context, result);
    };
  }
  async function pageAssets(
    getElicitation: Getter,
    pageUrl: string,
    preferences: CapabilityPreferences,
    localize: Localize,
    display: Display = {},
  ) {
    const origin = downloadSourceOrigin(pageUrl);
    if (origin == null)
      throw new AuthorityGateError(
        "downloadApproval",
        "browser_context_unavailable",
        "The browser could not determine the origin for this operation.",
      );
    return assetOrigin(
      getElicitation,
      origin,
      `I need your permission to download assets used by ${new URL(origin).host || origin}`,
      preferences,
      localize,
      display,
    );
  }
  async function pageAssetFetch(
    getElicitation: Getter,
    pageUrl: string,
    assetUrl: string,
    preferences: CapabilityPreferences,
    localize: Localize,
    display: Display = {},
  ) {
    const origin = downloadSourceOrigin(assetUrl);
    return origin == null || origin === downloadSourceOrigin(pageUrl)
      ? async () => {}
      : assetOrigin(
          getElicitation,
          origin,
          `I need your permission to download an asset from ${new URL(origin).host || origin}`,
          preferences,
          localize,
          display,
        );
  }
  async function webMcp(
    getElicitation: Getter,
    pageUrl: string,
    tool: any,
    display: Display = {},
  ) {
    const audit = {
      gate: "webMcpApproval",
      origin: httpOrigin(pageUrl) ?? undefined,
      toolName:
        tool.type === WebMcpInvokeTool.commandType ? tool.toolName : undefined,
    };
    const name = browserDisplayName(display);
    if (downloadSourceOrigin(pageUrl) == null)
      throw new AuthorityGateError(
        "webMcpApproval",
        "browser_context_unavailable",
        "The browser could not determine the origin for this operation.",
        audit,
      );
    if (tool.type === WebMcpListTools.commandType)
      return { audit, requestApproval: async () => {} };
    const origin = downloadSourceOrigin(tool.toolOrigin);
    if (origin == null)
      throw new AuthorityGateError(
        "webMcpApproval",
        "browser_context_unavailable",
        "The browser could not determine the origin for this operation.",
        audit,
      );
    audit.origin = httpOrigin(origin) ?? undefined;
    const ask = runtime.createElicitation(getElicitation, audit),
      sanitizedPage = approvalPageUrl(pageUrl),
      host = new URL(origin).host;
    const toolName = `webmcp:${encodeURIComponent(host)}:${encodeURIComponent(tool.toolName)}`;
    const title =
      tool.toolTitle == null
        ? tool.toolName
        : `${tool.toolTitle} (${tool.toolName})`;
    if (!isApprovalJson(tool.input))
      throw new AuthorityGateError(
        "webMcpApproval",
        "browser_context_unavailable",
        "The WebMCP tool input cannot be represented as JSON.",
        audit,
      );
    const request = {
      message: `Allow ${name} to invoke WebMCP tool ${tool.toolName} on ${origin}?`,
      meta: {
        codex_approval_kind: "mcp_tool_call",
        codex_request_type: "approval_request",
        codex_strict_auto_review: true,
        codex_sensitive_action: true,
        connector_id: "browser-use",
        connector_name: name,
        tool_name: toolName,
        tool_title: `Invoke ${title} on ${host}`,
        tool_description: tool.toolDescription,
        tool_params: tool.input,
        origin,
        ...(sanitizedPage == null ? {} : { page_url: sanitizedPage }),
      },
    };
    return {
      audit,
      requestApproval: async () =>
        approvalDecision(audit, await ask(request), "guardian-auto-review"),
    };
  }
  return { history, fileTransfer, fullCdp, pageAssets, pageAssetFetch, webMcp };
}
export const capabilityApprovals = createCapabilityApprovals();

/** Original MX: strips credentials/query/fragment but keeps the HTTP(S) path. */
export function approvalPageUrl(value: unknown) {
  if (typeof value === "string")
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return;
    }
}
/** Original k_: preserve its structural validation, including sparse arrays and non-plain objects. */
export function isApprovalJson(value: any): boolean {
  return value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
    ? true
    : typeof value === "number"
      ? Number.isFinite(value)
      : Array.isArray(value)
        ? value.every(isApprovalJson)
        : typeof value === "object" &&
          Object.values(value).every(isApprovalJson);
}
