/** Shared identity projection; intentionally independent of the Node Sentry SDK. */
export interface TelemetryIdentityRuntime {
  env: Record<string, unknown>;
  gaas?: { browserConfig: { user_id?: string } };
}
function trimmedEnvironment(runtime: TelemetryIdentityRuntime, name: string) {
  const value = runtime.env[name];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
/** Original _p: GAAS never falls back to the Node REPL user identifier. */
export function errorReporterUserId(runtime: TelemetryIdentityRuntime) {
  return trimmedEnvironment(runtime, "BROWSER_USE_SECURITY_MODE") === "gaas-browser-environment"
    ? runtime.gaas?.browserConfig.user_id?.trim() || undefined
    : trimmedEnvironment(runtime, "NODE_REPL_SENTRY_USER_ID");
}
