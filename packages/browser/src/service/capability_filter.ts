export interface EnvironmentSource {
  env: Record<string, unknown>;
}
export interface CapabilityRecord {
  id: string;
  [key: string]: unknown;
}
export interface CapabilityInventory {
  browser?: CapabilityRecord[];
  tab?: CapabilityRecord[];
}
/** Original dl: non-string environment values are absent, not coerced. */
export function environmentString(runtime: EnvironmentSource, key: string) {
  const value = runtime.env[key];
  return typeof value === "string" ? value : undefined;
}
/** Original jy. Empty entries are discarded after trimming, duplicates retained. */
export function commaSeparatedValues(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
/** Original CA. Unknown scopes follow the tab branch, matching the source conditional. */
export function disabledCapabilities(
  runtime: EnvironmentSource,
  scope: string,
) {
  return new Set(
    commaSeparatedValues(
      environmentString(
        runtime,
        scope === "browser"
          ? "BROWSER_USE_DISABLE_BROWSER_CAPABILITIES"
          : "BROWSER_USE_DISABLE_TAB_CAPABILITIES",
      ),
    ),
  );
}
/** Original AA. Preserve the input array identity when nothing is disabled. */
export function filterCapabilities<T extends CapabilityRecord>(
  capabilities: T[],
  disabled: Set<string>,
): T[] {
  return disabled.size === 0
    ? capabilities
    : capabilities.filter((info) => !disabled.has(info.id));
}
/** Original yp. Missing capability arrays become empty arrays. */
export function availableCapabilities(
  runtime: EnvironmentSource,
  capabilities: CapabilityInventory | undefined,
) {
  return {
    browser: filterCapabilities(
      capabilities?.browser ?? [],
      disabledCapabilities(runtime, "browser"),
    ),
    tab: filterCapabilities(
      capabilities?.tab ?? [],
      disabledCapabilities(runtime, "tab"),
    ),
  };
}
/** Original wp, used by runtime setup for API visibility. */
export function disabledApiMembers(runtime: EnvironmentSource) {
  return new Set(
    commaSeparatedValues(
      environmentString(runtime, "BROWSER_USE_DISABLE_API_MEMBERS"),
    ),
  );
}
