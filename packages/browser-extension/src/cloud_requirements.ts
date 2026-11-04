import { parse } from "smol-toml";
import { parseRequestHeaders } from "./request_headers";
function invalid(): never {
  throw new Error("Cloud requirements bundle is invalid.");
}
function isPlain(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function record(value: unknown) {
  if (!isPlain(value)) invalid();
  return value;
}
function optional<T>(value: unknown, convert: (value: any) => T): T | null {
  return value === undefined ? null : convert(value);
}
function mapped<T>(value: unknown, convert: (value: any) => T) {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, item]) => [key, convert(item)]),
  );
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}
function string(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function strings(value: unknown) {
  if (!Array.isArray(value)) invalid();
  return value.map(string);
}
function access(value: unknown) {
  if (value !== "allow" && value !== "deny") invalid();
  return value;
}
function lifetime(value: unknown) {
  if (value !== "turn" && value !== "thread") invalid();
  return value;
}
function originPolicy(value: unknown) {
  const data = record(value);
  return {
    access: optional(data.access, access),
    downloads: optional(data.downloads, access),
    uploads: optional(data.uploads, access),
    fullCdpAccess: optional(data.full_cdp_access, access),
    autoReview: optional(data.auto_review, access),
    persistentApproval: optional(data.persistent_approval, boolean),
    accessApprovalLifetime: optional(data.access_approval_lifetime, lifetime),
  };
}
function browserUse(value: unknown) {
  const data = record(value);
  return {
    extension: optional(data.extension, (extension) => ({
      requestHeaders: optional(
        record(extension).request_headers,
        parseRequestHeaders,
      ),
    })),
    allowWebmcp: optional(data.allow_webmcp, boolean),
    allowHistoryAccess: optional(data.allow_history_access, boolean),
    disableAutoReview: optional(data.disable_auto_review, boolean),
    allowGlobalPersistentApproval: optional(
      data.allow_global_persistent_approval,
      boolean,
    ),
    defaultOriginPolicy: optional(data.default_origin_policy, originPolicy),
    origins: optional(data.origins, (origins) => mapped(origins, originPolicy)),
  };
}
function network(value: unknown) {
  const data = record(value);
  const allowedDomains = optional(data.allowed_domains, strings),
    deniedDomains = optional(data.denied_domains, strings);
  const domains = optional(data.domains, (domains) => mapped(domains, access));
  if (domains !== null && (allowedDomains !== null || deniedDomains !== null))
    invalid();
  return {
    enabled: optional(data.enabled, boolean),
    domains,
    managedAllowedDomainsOnly: optional(
      data.managed_allowed_domains_only,
      boolean,
    ),
    allowedDomains,
    deniedDomains,
  };
}
function normalize(value: Record<string, any>) {
  if (value.features !== undefined && value.feature_requirements !== undefined)
    invalid();
  return {
    allowBrowserAndComputerUse: optional(
      value.allow_browser_and_computer_use,
      boolean,
    ),
    browserUse: optional(value.browser_use, browserUse),
    network: optional(value.experimental_network, network),
    featureRequirements: optional(
      value.features === undefined
        ? value.feature_requirements
        : value.features,
      (features) => mapped(features, boolean),
    ),
  };
}
function hasRequirements(value: ReturnType<typeof normalize>) {
  if (
    value.allowBrowserAndComputerUse !== null ||
    value.network !== null ||
    Object.keys(value.featureRequirements ?? {}).length > 0
  )
    return true;
  const browser = value.browserUse;
  return browser === null
    ? false
    : browser.extension?.requestHeaders != null ||
        browser.allowWebmcp !== null ||
        browser.allowHistoryAccess !== null ||
        browser.disableAutoReview !== null ||
        browser.allowGlobalPersistentApproval !== null ||
        Object.values(browser.defaultOriginPolicy ?? {}).some(
          (value) => value !== null,
        ) ||
        Object.values(browser.origins ?? {}).some(
          (value) =>
            value != null && Object.values(value).some((item) => item !== null),
        );
}
function merge(
  base: Record<string, any>,
  override: Record<string, any>,
): Record<string, any> {
  const result = new Map(Object.entries(base));
  for (const [key, value] of Object.entries(override)) {
    const previous = result.get(key);
    result.set(
      key,
      isPlain(previous) && isPlain(value) ? merge(previous, value) : value,
    );
  }
  return Object.fromEntries(result);
}
/** Original Mg: validate each layer, reverse precedence, then normalize the merged policy. */
export function parseCloudRequirements(value: unknown) {
  try {
    const bundle = record(value);
    if (bundle.requirements_toml == null) return { requirements: null };
    const toml = record(bundle.requirements_toml);
    if (toml.enterprise_managed == null) return { requirements: null };
    if (!Array.isArray(toml.enterprise_managed)) invalid();
    let merged = {};
    for (const layer of toml.enterprise_managed.toReversed()) {
      const parsed = parse(string(record(layer).contents), {
        integersAsBigInt: true,
      });
      normalize(parsed);
      merged = merge(merged, parsed);
    }
    const requirements = normalize(merged);
    return {
      requirements: hasRequirements(requirements) ? requirements : null,
    };
  } catch {
    return invalid();
  }
}
