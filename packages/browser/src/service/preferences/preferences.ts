import { AuthorityGateError } from "../errors/authority_gate_error";
import { downloadSourceOrigin } from "../context/downloads";
import { buildNetworkPolicy } from "./network_config";
import {
  parsePolicyOrigin,
  readOriginPolicy,
  isOriginBlockedByPolicy,
} from "./origin_policy";
import {
  ConfigReadError,
  isRecord,
  storedOriginMatches,
  readPermissionSnapshot,
  historyModeKey,
  historyApprovalMode,
  isUserReviewed,
  promptPersistence,
} from "./persisted_permissions";
import {
  preferenceSessionId,
  preferenceTurn,
  guardianV2Required,
  guardianThreadId,
  type PreferenceRuntime,
} from "./request_context";
import {
  promptResultHandler,
  persistentApprovalAllowed,
  globalPersistentApprovalAllowed,
  type ApprovalRequest,
  type ApprovalResult,
  type PreferenceConfig,
} from "./prompt_results";
import type { GuardianReview } from "./guardian_cache";
import { maybeAutoAnswerBrowserUseRequest } from "./auto_answer";
/** Original UC/s5; HTTP/sandbox policy origins and file URLs use different matching targets. */
export function webMcpPermission(
  origin: string,
  settings: {
    webMcpEnabled: boolean;
    allowedWebMcpOrigins: string[];
    deniedWebMcpOrigins: string[];
  },
) {
  const url = parsePolicyOrigin(origin);
  let target;
  if (url != null)
    target = { raw: `${url.protocol}//${url.host}`, hostPort: url.host };
  else
    try {
      const file = new URL(origin);
      if (file.protocol !== "file:") return "invalid-origin";
      file.search = "";
      file.hash = "";
      target = { raw: file.href, hostPort: null };
    } catch {
      return "invalid-origin";
    }
  const matches = (pattern: string) =>
    storedOriginMatches(pattern.trim(), target);
  return settings.deniedWebMcpOrigins.some(matches)
    ? "site-denied"
    : settings.allowedWebMcpOrigins.some(matches)
      ? "allowed"
      : settings.webMcpEnabled === false
        ? "default-denied"
        : "allowed";
}
type Runtime = PreferenceRuntime & { env: Record<string, unknown> };
/** Original lu assembled over reconstructed policies, stores and shared cache modules. */
export class Preferences {
  config: PreferenceConfig;
  runtime: Runtime;
  constructor(config: PreferenceConfig, runtime: Runtime) {
    this.config = config;
    this.runtime = runtime;
  }
  async getExtensionRequestHeaders() {
    return (await this.config.readRequirements())?.requirements?.browserUse
      ?.extension?.requestHeaders;
  }
  async getNetworkPolicy() {
    const [requirements, snapshot, origins] = await Promise.all([
      this.config.readRequirements(),
      this.config.readAll(),
      this.config.global.get("origins", { refresh: true }),
    ]);
    const denied = isRecord(origins) ? origins.denied : undefined;
    return buildNetworkPolicy(
      { type: "externalSandbox", networkAccess: "enabled" },
      requirements,
      snapshot,
      Array.isArray(denied)
        ? denied.filter((item) => typeof item === "string")
        : [],
    );
  }
  async getOriginPermission(
    origin: string,
    context = this.captureOriginRequestContext(origin),
  ) {
    return this.maybeAutoAnswerBrowserUseRequest({
      ...context,
      resource: { kind: "origin", origin },
    });
  }
  captureOriginRequestContext(origin: string) {
    const guardianMode = guardianV2Required(this.runtime) ? "v2" : "v1",
      threadId = guardianThreadId(this.runtime),
      normalized = downloadSourceOrigin(origin);
    return {
      preferenceSessionId: preferenceSessionId(this.runtime),
      guardianMode,
      guardianOrigin:
        threadId != null && normalized != null
          ? { threadId, origin: normalized }
          : undefined,
      turn: preferenceTurn(this.runtime),
    };
  }
  async getFileTransferPermission(transferKind: string, origin: string) {
    return this.maybeAutoAnswerBrowserUseRequest({
      preferenceSessionId: preferenceSessionId(this.runtime),
      resource: { kind: "fileTransfer", origin, transferKind },
      turn: preferenceTurn(this.runtime),
    });
  }
  async isOriginBlockedByPolicy(origin: string, operation: string) {
    return operation === "access"
      ? isOriginBlockedByPolicy(origin, this.config)
      : ((await readOriginPolicy(origin, this.config)) as any)[operation] ===
          "deny";
  }
  async getFullCdpPermission(origin: string) {
    return this.maybeAutoAnswerBrowserUseRequest({
      preferenceSessionId: preferenceSessionId(this.runtime),
      resource: { kind: "fullCdp", origin },
      turn: preferenceTurn(this.runtime),
    });
  }
  async isFullCdpEnabled() {
    return (await this.fullCdpAccessState()).enabled;
  }
  async isWebMcpEnabled(origin: string, settingsUrl?: string) {
    const instructions = `Review Agent permissions → Site tools in ${settingsUrl == null ? "browser settings" : `[Browser settings](${settingsUrl})`}.`;
    const unreadable = `The browser could not read Site tools settings for ${origin}, so site tools were not accessed. Try again after the settings can be read.`;
    const snapshot = await readPermissionSnapshot(
        this.config.global,
        ["webmcp", "webmcp_enabled"],
        true,
      ),
      sites = snapshot.webmcp,
      enabled = snapshot.webmcp_enabled;
    if (
      (sites != null && !isRecord(sites)) ||
      (enabled != null && typeof enabled !== "boolean")
    )
      return { enabled: false, message: unreadable };
    const allowed = sites?.allowed ?? [],
      denied = sites?.denied ?? [];
    if (
      !Array.isArray(allowed) ||
      !allowed.every((item) => typeof item === "string") ||
      !Array.isArray(denied) ||
      !denied.every((item) => typeof item === "string")
    )
      return { enabled: false, message: unreadable };
    const permission = webMcpPermission(origin, {
      webMcpEnabled: enabled ?? true,
      allowedWebMcpOrigins: allowed,
      deniedWebMcpOrigins: denied,
    });
    switch (permission) {
      case "allowed":
        return { enabled: true };
      case "site-denied":
        return {
          enabled: false,
          message: `Site tools are disabled for ${origin} by a saved site permission. ${instructions}`,
        };
      case "default-denied":
        return {
          enabled: false,
          message: `Site tools are disabled for ${origin} by the default setting. ${instructions}`,
        };
      case "invalid-origin":
        return { enabled: false, message: unreadable };
      default:
        throw new Error(`Unexpected Site tools permission: ${permission}`);
    }
  }
  async assertFullCdpEnabled() {
    const state = await this.fullCdpAccessState();
    if (!state.enabled)
      throw new AuthorityGateError(
        "fullCdpConfiguration",
        "browser_capability_blocked",
        state.reason!,
        { source: "config" },
      );
  }
  async isHistoryBlockedByPolicy() {
    const [requirements, snapshot] = await Promise.all([
      this.config.readRequirements(),
      this.config.readAll(),
    ]);
    return (
      requirements?.requirements?.browserUse?.allowHistoryAccess === false ||
      snapshot?.config.browser_use?.allow_history_access === false
    );
  }
  async getHistoryPermission(backend: string) {
    const snapshot = await readPermissionSnapshot(this.config.global, [
        historyModeKey(backend),
      ]),
      mode = historyApprovalMode(snapshot, backend);
    return mode === "always_ask" ||
      (mode === "never_ask" && !(await this.allowsGlobalPersistentApproval()))
      ? null
      : {
          decision: mode === "never_ask" ? "approve" : "deny",
          scope: "global",
          source: "browser-use-persisted-state",
        };
  }
  async isAutoReviewDisabled() {
    return (await this.config.global.get("disable_auto_review")) === true
      ? true
      : (await this.config.readRequirements())?.requirements?.browserUse
          ?.disableAutoReview === true;
  }
  async isEmailOtpAlwaysAllowed() {
    return (
      (await this.config.global.get("email_otp_approval_mode", {
        refresh: true,
      })) === "never_ask"
    );
  }
  async isOriginAutoReviewDisabled(origin: string) {
    return (await readOriginPolicy(origin, this.config)).autoReview === "deny";
  }
  async isPersistentApprovalAllowed(origin: string) {
    return persistentApprovalAllowed(origin, this.config);
  }
  async allowsGlobalPersistentApproval() {
    return globalPersistentApprovalAllowed(this.config);
  }
  async handleOriginPromptResult(
    origin: string,
    result: ApprovalResult,
    context = this.captureOriginRequestContext(origin),
    {
      guardianReview,
      guardianReviewRequested = true,
    }: {
      guardianReview?: GuardianReview;
      guardianReviewRequested?: boolean;
    } = {},
  ) {
    await promptResultHandler.handlePromptResult(
      {
        ...context,
        guardianReview,
        guardianReviewRequested,
        resource: { kind: "origin", origin },
      },
      result,
      this.config,
    );
  }
  async handleFileTransferPromptResult(
    transferKind: string,
    origin: string,
    result: ApprovalResult,
  ) {
    await promptResultHandler.handlePromptResult(
      {
        preferenceSessionId: preferenceSessionId(this.runtime),
        resource: { kind: "fileTransfer", origin, transferKind },
        turn: preferenceTurn(this.runtime),
      },
      result,
      this.config,
    );
  }
  async handleFullCdpPromptResult(origin: string, result: ApprovalResult) {
    await promptResultHandler.handlePromptResult(
      {
        preferenceSessionId: preferenceSessionId(this.runtime),
        resource: { kind: "fullCdp", origin },
        turn: preferenceTurn(this.runtime),
      },
      result,
      this.config,
    );
  }
  async handleHistoryPromptResult(result: ApprovalResult, backend: string) {
    if (
      !(
        result.action !== "accept" ||
        !isUserReviewed(result) ||
        promptPersistence(result) !== "global"
      ) &&
      (await this.allowsGlobalPersistentApproval())
    )
      try {
        await this.config.global.set(historyModeKey(backend), "never_ask");
      } catch (error) {
        if (error instanceof ConfigReadError) throw error;
      }
  }
  async fullCdpAccessState() {
    const mode = this.runtime.env.BROWSER_USE_SECURITY_MODE;
    const hosted =
      (typeof mode === "string" ? mode.trim() : undefined) ===
      "gaas-browser-environment";
    if (hosted && this.runtime.env.BROWSER_USE_FULL_CDP_ACCESS_ENABLED !== "1")
      return {
        enabled: false,
        reason: "Full CDP access is disabled for this deployment.",
      };
    const [enabled, requirements] = await Promise.all([
      hosted ? null : this.config.global.get("full_cdp_access_enabled"),
      this.config.readRequirements(),
    ]);
    return (requirements?.requirements as any)?.featureRequirements
      ?.browser_use_full_cdp_access === false
      ? {
          enabled: false,
          reason: "Full CDP access is disabled by enterprise policy.",
        }
      : !hosted && enabled !== true
        ? {
            enabled: false,
            reason: "Full CDP access is disabled in browser config.",
          }
        : { enabled: true };
  }
}

// Install the restored method directly, avoiding an extra asynchronous forwarding layer.
export interface Preferences {
  maybeAutoAnswerBrowserUseRequest: OmitThisParameter<
    typeof maybeAutoAnswerBrowserUseRequest
  >;
}
Object.defineProperty(
  Preferences.prototype,
  "maybeAutoAnswerBrowserUseRequest",
  {
    value: maybeAutoAnswerBrowserUseRequest,
    writable: true,
    configurable: true,
  },
);
