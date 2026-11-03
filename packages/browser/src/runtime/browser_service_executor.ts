import {
  SECURITY_REJECTED_PREFIX,
  SECURITY_UNAVAILABLE_PREFIX,
  SECURITY_REJECTED_SUFFIX,
  SECURITY_UNAVAILABLE_SUFFIX,
  ORBIT_ERROR_SUFFIX,
} from "../errors/browser_security_error";
import {
  BrowserCredentialRecoveryError,
  parseCredentialRecoveryDetails,
} from "../errors/credential_recovery_error";
import type { ExecuteAgentCommand } from "./function_agent_transport";

// Extracted from Im's executeAgentCommand method; setup.ts supplies the original
// host RPC routes. Recovery and Orbit rewriting are independently testable here.
export function createBrowserServiceExecutor({
  execute,
  executeWithRecovery,
  credentialRecoveryErrorVersion,
  environment,
}: {
  execute: ExecuteAgentCommand;
  executeWithRecovery: ExecuteAgentCommand;
  credentialRecoveryErrorVersion: unknown;
  environment?: string;
}): ExecuteAgentCommand {
  return async function executeAgentCommand(command) {
    try {
      if (credentialRecoveryErrorVersion !== 1) return await execute(command);
      const response = (await executeWithRecovery(command)) as any;
      if (response?.ok === true) return response.value;
      const details = parseCredentialRecoveryDetails(
        response?.ok === false ? response.error : undefined,
      );
      throw details == null
        ? new Error("Browser service returned an invalid recovery response")
        : new BrowserCredentialRecoveryError(details);
    } catch (error) {
      if (
        environment === "orbit" &&
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        const message = rewriteOrbitErrorMessage(error.message);
        if (message !== error.message) error.message = message;
      }
      throw error;
    }
  };
}

function rewriteOrbitErrorMessage(message: string): string {
  const rejectedIndex = message.includes(SECURITY_REJECTED_PREFIX)
    ? message.lastIndexOf(SECURITY_REJECTED_SUFFIX)
    : -1;
  const unavailableIndex = message.includes(SECURITY_UNAVAILABLE_PREFIX)
    ? message.lastIndexOf(SECURITY_UNAVAILABLE_SUFFIX)
    : -1;
  const index = Math.max(rejectedIndex, unavailableIndex);
  if (index < 0 || message.lastIndexOf(ORBIT_ERROR_SUFFIX) > index)
    return message;
  const suffix =
    index === rejectedIndex
      ? SECURITY_REJECTED_SUFFIX
      : SECURITY_UNAVAILABLE_SUFFIX;
  const replacement =
    index === rejectedIndex ? ORBIT_ERROR_SUFFIX : `.${ORBIT_ERROR_SUFFIX}`;
  return (
    message.slice(0, index) + replacement + message.slice(index + suffix.length)
  );
}
