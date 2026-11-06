/** Host deployment adapter. Policy evaluation remains in the native provider. */
export type NativePolicyConfiguration =
  | { policy_source: "standalone"; app_policy: Record<string, { decision?: string }> }
  | { policy_source: "app-server"; codex_cli_path?: string };

export function nativePolicyConfiguration(env: Record<string, string>): NativePolicyConfiguration {
  const source = env.CORE_CUA_POLICY_SOURCE ?? "standalone";
  if (source === "app-server") {
    if (env.CORE_CUA_APP_POLICY !== undefined)
      throw Error("CORE_CUA_POLICY_SOURCE=app-server conflicts with CORE_CUA_APP_POLICY; choose one policy source.");
    return { policy_source: source, ...(env.CODEX_CLI_PATH !== undefined ? { codex_cli_path: env.CODEX_CLI_PATH } : {}) };
  }
  if (source !== "standalone") throw Error("CORE_CUA_POLICY_SOURCE must be standalone or app-server.");
  const policy: unknown = JSON.parse(env.CORE_CUA_APP_POLICY ?? "{}");
  if (!policy || typeof policy !== "object" || Array.isArray(policy))
    throw Error("CORE_CUA_APP_POLICY must be a native app rule map");
  // The Rust/Swift boundary validates rule values. Never evaluate or broaden them here.
  return { policy_source: source, app_policy: policy as Record<string, { decision?: string }> };
}
