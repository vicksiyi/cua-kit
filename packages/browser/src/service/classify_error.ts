import { BrowserUseSecurityError } from "./errors/browser_security_error";
import { LocatorError } from "./errors/locator_error";
/** Original rp. Shape-compatible objects and client-bundle errors are not accepted. */
export function securityErrorReason(error: unknown) {
  return error instanceof BrowserUseSecurityError ? error.reason : null;
}
/** Original Qa. Internal telemetry keeps unknown distinct from public browser_error. */
export function classifyCommandError(error: unknown): string {
  const reason = securityErrorReason(error);
  if (reason != null) return reason;
  if (error instanceof LocatorError) return "locator_timeout";
  const message = error instanceof Error ? error.message : error;
  return typeof message !== "string"
    ? "unknown"
    : message.startsWith('Timed out running CDP command "') ||
        message.startsWith('Timed out translating CDP input command "') ||
        (message.startsWith("Timed out after ") &&
          message.includes("ms waiting for CDP command "))
      ? "cdp_timeout"
      : "unknown";
}
/** Original Vut, the actual service export. */
export function classifyError(error: unknown) {
  const kind = classifyCommandError(error);
  return kind === "unknown" ? "browser_error" : kind;
}
