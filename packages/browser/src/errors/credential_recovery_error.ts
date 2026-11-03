import {
  BrowserUseSecurityError,
  securityReasonInfo,
} from "./browser_security_error";
import type { BrowserSecurityReason } from "./browser_security_error";

export type RecoveryReason =
  | "credential_delivery_in_progress"
  | "credential_observation_restricted"
  | "retained_data_restricted"
  | "credential_state_unavailable"
  | "protected_command_failed"
  | "browser_security_restricted"
  | "browser_security_unavailable";
export type RecoveryAction =
  | "retry_after_credential_delivery"
  | "navigate_to_new_document"
  | "create_new_tab"
  | "request_manual_handoff"
  | "restart_browser_runtime"
  | "retry_after_resolution"
  | "stop";
export interface CredentialRecoveryDetails {
  schema_version: 1;
  command: string;
  phase: "before_command" | "command" | "after_command" | "error_recheck";
  reason: RecoveryReason;
  next_action: RecoveryAction;
  security_reason?: BrowserSecurityReason;
}

/** Original d. Parsing is a separate operation, not implicit in construction. */
export class BrowserCredentialRecoveryError extends Error {
  details: Readonly<CredentialRecoveryDetails>;
  constructor(details: CredentialRecoveryDetails) {
    super(formatRecoveryError(details));
    this.name = "BrowserCredentialRecoveryError";
    this.details = Object.freeze({
      schema_version: 1,
      command: details.command,
      phase: details.phase,
      reason: details.reason,
      next_action: details.next_action,
      security_reason: details.security_reason,
    });
  }
}
function formatRecoveryError(details: CredentialRecoveryDetails) {
  let message: string | undefined;
  switch (details.reason) {
    case "credential_delivery_in_progress":
      message =
        "Browser observation is unavailable while credential delivery is in progress.";
      break;
    case "credential_observation_restricted":
      message =
        "Browser observation is unavailable because credential protection restricts this observation.";
      break;
    case "retained_data_restricted":
      message =
        "Browser observation is unavailable because retained browser data remains restricted after native credential delivery.";
      break;
    case "credential_state_unavailable":
      message =
        "Browser observation is unavailable because native credential state cannot be safely resumed.";
      break;
    case "protected_command_failed":
      message =
        "Browser observation is unavailable because the browser command failed while credential protection was active. The underlying error was withheld because it may contain protected data; this does not establish a credential-policy denial.";
      break;
    case "browser_security_restricted":
    case "browser_security_unavailable":
      message =
        details.security_reason == null
          ? "A browser security check prevented this command from completing."
          : new BrowserUseSecurityError(details.security_reason, "").message;
  }
  const nextAction = {
    retry_after_credential_delivery:
      "Wait for credential delivery to finish, then retry the command.",
    navigate_to_new_document:
      "Navigate to a new document to continue. If observation remains blocked, use Tab.requestUserTakeover() to let the user take over.",
    create_new_tab:
      "Select a browser by ID and create a new tab with cua.createBrowserTab(), or use Browser.tabs.new() followed by Tab.goto(), to continue on a new document.",
    request_manual_handoff:
      "Use Tab.requestUserTakeover() to let the user take over.",
    restart_browser_runtime: "Start a new browser runtime to continue.",
    retry_after_resolution: "Retry after the reported check is available.",
    stop: "Stop this browser action and report the failure.",
  }[details.next_action];
  return `${message} ${nextAction} Recovery v1: command=${details.command}, phase=${details.phase}, reason=${details.reason}, next_action=${details.next_action}.`;
}

/** Original l: invalid input returns undefined; unknown fields are projected away. */
export function parseCredentialRecoveryDetails(
  value: unknown,
): CredentialRecoveryDetails | undefined {
  if (value == null || typeof value !== "object") return;
  const details = value as Record<string, any>;
  if (
    details.schema_version !== 1 ||
    typeof details.command !== "string" ||
    !/^[a-z_]{1,64}$/.test(details.command) ||
    typeof details.phase !== "string" ||
    !["before_command", "command", "after_command", "error_recheck"].includes(
      details.phase,
    )
  )
    return;
  const allowedActions: Record<string, string[]> = {
    credential_delivery_in_progress: ["retry_after_credential_delivery"],
    credential_observation_restricted: ["navigate_to_new_document"],
    retained_data_restricted: ["create_new_tab", "stop"],
    credential_state_unavailable: ["restart_browser_runtime"],
    protected_command_failed: ["request_manual_handoff", "stop"],
    browser_security_restricted: ["stop"],
    browser_security_unavailable: ["retry_after_resolution"],
  };
  if (
    typeof details.reason !== "string" ||
    typeof details.next_action !== "string" ||
    !Object.hasOwn(allowedActions, details.reason) ||
    !allowedActions[details.reason].includes(details.next_action)
  )
    return;
  const securityReason = details.security_reason;
  if (details.reason.startsWith("browser_security_")) {
    if (
      !(
        typeof securityReason === "string" &&
        Object.hasOwn(securityReasonInfo, securityReason)
      ) ||
      new BrowserUseSecurityError(securityReason as BrowserSecurityReason, "")
        .retryable !==
        (details.reason === "browser_security_unavailable")
    )
      return;
  } else if (securityReason !== undefined) return;
  return {
    schema_version: 1,
    command: details.command,
    phase: details.phase as CredentialRecoveryDetails["phase"],
    reason: details.reason as RecoveryReason,
    next_action: details.next_action as RecoveryAction,
    security_reason: securityReason,
  };
}
