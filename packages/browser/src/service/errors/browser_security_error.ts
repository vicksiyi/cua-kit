// Service bundle St/j8/JT and message constants. Kept separate from client class identity.
export const SECURITY_REJECTED_PREFIX =
  "Browser Use rejected this action due to browser security policy. Reason:" as const;
export const SECURITY_UNAVAILABLE_PREFIX =
  "Browser Use could not complete this action because a browser security check was unavailable. Reason:" as const;
export const SECURITY_REJECTED_SUFFIX =
  " The agent must not attempt to achieve the same outcome via workaround, indirect execution, raw CDP or browser commands, alternate browser surfaces, or policy circumvention. Proceed only with a materially safer alternative that does not require this blocked browser action; if none exists, stop and request user input." as const;
export const SECURITY_UNAVAILABLE_SUFFIX =
  ", but must not bypass browser security controls or use an indirect workaround." as const;
export const ORBIT_ERROR_SUFFIX =
  " This browser action encountered an error. Continue through a safer or more directly authorized path. If additional authorization is clearly necessary, ask the user before proceeding." as const;
export const securityReasonInfo = {
  approval_cancelled: {
    decisionSource: "approval",
    message: "The permission request was dismissed before a decision was made.",
    retryable: true,
  },
  approval_failed_closed: {
    decisionSource: "approval",
    message:
      "The permission request could not complete, so access was not granted.",
    retryable: true,
  },
  approval_unavailable: {
    decisionSource: "approval",
    message: "Browser Use could not request permission.",
    retryable: true,
  },
  browser_capability_blocked: {
    decisionSource: "browser",
    message: "The browser capability policy blocks this action.",
    retryable: false,
  },
  browser_capability_unavailable: {
    decisionSource: "browser",
    message:
      "The browser capability policy could not be verified, so access was not granted.",
    retryable: true,
  },
  browser_context_unavailable: {
    decisionSource: "browser",
    message: "The browser context needed for this action is unavailable.",
    retryable: true,
  },
  browser_navigation_blocked: {
    decisionSource: "browser",
    message:
      "The browser blocked this navigation; this was not a site-status decision or a user rejection.",
    retryable: false,
  },
  enterprise_policy_blocked: {
    decisionSource: "enterprise",
    message: "The admin-enforced policy blocks this action.",
    retryable: false,
  },
  enterprise_policy_unavailable: {
    decisionSource: "enterprise",
    message:
      "The admin-enforced policy could not be verified, so access was not granted.",
    retryable: true,
  },
  guardian_denied: {
    decisionSource: "guardian",
    message:
      "Auto-review denied this action; this was not a manual user rejection.",
    retryable: false,
  },
  guardian_timed_out: {
    decisionSource: "guardian",
    message:
      "Auto-review timed out without an approval decision; this was not a determination that the action was unsafe. You may retry once.",
    retryable: true,
  },
  navigation_url_policy_blocked: {
    decisionSource: "browser",
    message: "The browser URL policy blocks this action.",
    retryable: false,
  },
  persisted_user_denied: {
    decisionSource: "user_persisted_setting",
    message: "A saved user permission setting blocks this action.",
    retryable: false,
  },
  site_status_blocked: {
    decisionSource: "site_status",
    message:
      "The site-safety policy blocks this action; no user permission prompt or Auto-review was attempted.",
    retryable: false,
  },
  site_status_unavailable: {
    decisionSource: "site_status",
    message: "The site-safety check was unavailable.",
    retryable: true,
  },
  user_declined: {
    decisionSource: "user_decision",
    message: "The user declined permission for this action.",
    retryable: false,
  },
} as const;

export type BrowserSecurityReason = keyof typeof securityReasonInfo;
export class BrowserUseSecurityError extends Error {
  decisionSource: (typeof securityReasonInfo)[BrowserSecurityReason]["decisionSource"];
  reason: BrowserSecurityReason;
  retryable: boolean;
  constructor(
    reason: BrowserSecurityReason,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(formatSecurityError(reason, detail), options);
    const info = securityReasonInfo[reason];
    this.name = "BrowserUseSecurityError";
    this.decisionSource = info.decisionSource;
    this.reason = reason;
    this.retryable = info.retryable;
  }
}
function formatSecurityError(reason: BrowserSecurityReason, detail: string) {
  const info = securityReasonInfo[reason];
  const message = `${info.message} ${detail}`;
  return info.retryable
    ? `${SECURITY_UNAVAILABLE_PREFIX} ${message} This failure may be temporary. The agent may retry after the issue is resolved${SECURITY_UNAVAILABLE_SUFFIX}`
    : `${SECURITY_REJECTED_PREFIX} ${message}${SECURITY_REJECTED_SUFFIX}`;
}
