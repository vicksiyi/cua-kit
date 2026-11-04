import {
  createBrowserDocumentation,
  type DocumentationBundle,
  type DocumentationFilesystem,
  type DocumentationOptions,
} from "../context/documentation";
import type { RecoveryTelemetry } from "./command_scheduler";
const overridableDocuments = new Set([
  "api-use-behavior",
  "bootstrap-troubleshooting",
  "browser-troubleshooting",
  "capabilities/browser/viewport",
  "capabilities/browser/visibility",
  "capabilities/tab/botDetection",
  "capabilities/tab/browserAuth",
  "capabilities/tab/cdp",
  "capabilities/tab/pageAssets",
  "cloud-auth",
  "cloud-no-auth",
  "cloud-shared-files",
  "file-uploads",
  "screenshots",
  "visibility",
]);
/** Original j3, composed with the restored wf/oD/iD asset loader. */
export function createRuntimeDocumentation(
  moduleUrl: string,
  bundle?: DocumentationBundle,
) {
  const assets = createBrowserDocumentation(moduleUrl, bundle);
  async function readDocumentation(
    runtime: any,
    name: string,
    filesystem: DocumentationFilesystem,
    { environment }: DocumentationOptions = {},
  ) {
    const workBrowserAuth =
      environment === "cloud" &&
      runtime.env.BROWSER_USE_WORK_BROWSER_AUTH_ENABLED === "1";
    if (workBrowserAuth && name === "capabilities/tab/browserAuth")
      name = "capabilities/tab/unified/browserAuth";
    const orbitAuth =
      environment === "orbit" && name === "capabilities/tab/browserAuth";
    if (
      !orbitAuth &&
      !(workBrowserAuth && name === "cloud-auth") &&
      overridableDocuments.has(name)
    ) {
      const override =
        runtime.gaas?.browserConfig.instruction_overrides?.[name];
      if (override?.trim()) return override;
    }
    const text = await assets.readDocumentation(name, filesystem, {
      environment,
    });
    if (orbitAuth) {
      const enabled = runtime.env.BROWSER_USE_AUTOMATIC_OTP_ENABLED === "1";
      return text.replace(
        /<!-- otp-autofill-enabled -->\r?\n([\s\S]*?)<!-- otp-autofill-disabled -->\r?\n([\s\S]*?)<!-- \/otp-autofill -->\r?\n?/gu,
        (_match, yes, no) => (enabled ? yes : no),
      );
    }
    return text;
  }
  return {
    loadApiManifest: assets.apiManifest,
    loadDocumentManifest: assets.documentManifest,
    readDocumentation,
  };
}
const downloadCommands = new Set([
  "playwright_download_path",
  "playwright_wait_for_download",
  "cua_download_media",
  "dom_cua_download_media",
  "playwright_locator_download_media",
]);
const iabDownloads = new Set([
  "playwright_download_path",
  "playwright_locator_download_media",
  "playwright_wait_for_download",
]);
/** Original H3/Sue/wue. This is a capability check, not usage telemetry. */
export function assertCommandSupported({
  browserInfo,
  commandType,
}: {
  browserInfo: any;
  commandType: string;
}) {
  if (
    downloadCommands.has(commandType) &&
    browserInfo.type === "iab" &&
    !iabDownloads.has(commandType)
  )
    throw new Error(`Downloads are not supported by ${browserInfo.name}.`);
}
/** Installed Vr and V3 version literals; keep reconstruction baseline rather than npm package version. */
export const browserClientRelease = "1.0.0";
export function reportCommandRecovery(
  runtime: any,
  details: RecoveryTelemetry,
) {
  const bundledVersion = "0.1.1",
    commit = runtime.env.CAAS_IMAGE_GIT_COMMIT_SHA ?? "",
    credentialVersion =
      runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION,
    manualVersion = runtime.env.BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION;
  runtime.setResponseMeta({
    "codex/browserCredentialRecovery": {
      schema_version: 1,
      command: details.command,
      phase: details.phase,
      reason: details.reason,
      next_action: details.next_action,
      security_reason: details.security_reason,
      guard_state_before: details.guard_state_before,
      guard_state_after: details.guard_state_after,
      observation_changed: details.observation_changed,
      browser_client_version: browserClientRelease,
      bundled_browser_version: /^[A-Za-z0-9._+-]{1,128}$/.test(bundledVersion)
        ? bundledVersion
        : "unknown",
      caas_image_git_commit_sha: /^[0-9a-f]{40}$/i.test(commit)
        ? commit
        : "unknown",
      credential_binding_version:
        credentialVersion === "1" || credentialVersion === "2"
          ? credentialVersion
          : "unknown",
      manual_save_binding_version:
        manualVersion === "7" || manualVersion === "8" || manualVersion === "10"
          ? manualVersion
          : "unknown",
    },
  });
}
const decisions: Record<string, any> = {
  success: { decision: "allowed", decision_context: "evaluated" },
  denied: { decision: "denied", decision_context: "evaluated" },
  bypassed: { decision: "allowed", decision_context: "not_required" },
  error_fail_closed: { decision: "denied", decision_context: "error" },
};
const sources: Record<string, string> = {
  "guardian-auto-review": "automated_review",
  "guardian-origin-cache": "automated_review",
  user_decision: "user",
  "browser-use-turn-cache": "user",
  "browser-use-persisted-state": "saved_user_permission",
  "codex-history-policy": "history_policy",
  "codex-network-policy": "network_policy",
  "navigation-url-policy": "builtin_rule",
  "site-status": "openai_site_policy",
  "security-mode": "security_mode",
  config: "builtin_rule",
};
const permissions: Record<string, string> = {
  "automated-safety-precheck": "browser_auth",
  "browser-history-read": "browser_history",
  "browser-origin-access": "origin_access",
  "check-navigation-url-policy": "origin_access",
  "check-url-site-status": "origin_access",
  "file-download": "file_download",
  "file-upload": "file_upload",
  "full-cdp": "full_cdp_access",
  "page-asset-cross-origin-fetch": "page_asset_cross_origin_fetch",
  "page-asset-download": "page_asset_download",
  "raw-cdp-destination-url": "raw_cdp_destination",
  "webmcp-tool-call": "webmcp_access",
};
/** Original G3. URL checks emit only denials, and cancellation takes precedence over cache. */
export function securityCheckAttributes(check: any) {
  if (
    (check.check === "check-navigation-url-policy" ||
      check.check === "check-url-site-status") &&
    check.outcome !== "denied"
  )
    return;
  const decision = { ...decisions[check.outcome] };
  if (check.reason === "approval_cancelled")
    decision.decision_context = "cancelled";
  else if (
    check.cached ||
    (check.outcome === "success" &&
      (check.permissionSource === "guardian-origin-cache" ||
        check.permissionSource === "browser-use-turn-cache"))
  )
    decision.decision_context = "cached";
  return {
    schema_version: 1,
    permission: permissions[check.authorization ?? check.check],
    ...decision,
    decided_by:
      check.permissionSource === undefined
        ? "unknown"
        : sources[check.permissionSource],
    policy: check.policy,
    reason: check.reason,
    origin: check.origin,
    connector_id: check.connectorId,
    tool_name: check.toolName,
    backend: check.backend,
    duration_ms: check.durationMs,
  };
}
