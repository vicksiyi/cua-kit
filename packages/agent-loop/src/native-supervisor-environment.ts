/** Host-only deployment inputs. Workers receive separately constructed env maps. */
export const nativeSupervisorEnvironmentKeys = [
  "HOME", "PATH", "CODEX_HOME", "CODEX_CLI_PATH", "NODE_REPL_RUNTIME_MODE",
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy",
] as const;

export function nativeSupervisorEnvironment(
  environment: Record<string, string>,
  temporaryDirectory: string,
): Record<string, string> {
  const result: Record<string, string> = {
    HOME: temporaryDirectory,
    TMPDIR: temporaryDirectory,
  };
  for (const key of nativeSupervisorEnvironmentKeys) {
    // Empty values have native semantics; do not replace them with fallbacks.
    if (environment[key] !== undefined) result[key] = environment[key];
  }
  return result;
}

/** Explicit host inputs for the native policy subprocess, not sandbox workers. */
export function nativeAppServerEnvironment(environment: Record<string, string>, temporaryDirectory: string): Record<string, string> {
  const host = nativeSupervisorEnvironment(environment, temporaryDirectory);
  // CLI selection has its own spec field; runtime mode belongs to the Rust host.
  delete host.CODEX_CLI_PATH;
  delete host.NODE_REPL_RUNTIME_MODE;
  return host;
}
