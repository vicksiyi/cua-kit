import {
  parseOriginPattern,
  originPatternMatches,
  parseHostPatterns,
  anyHostPatternMatches,
} from "./origin_patterns";
import {
  effectiveNetworkConfig,
  type EffectiveNetworkConfig,
  type Requirements,
  type ConfigSnapshot,
} from "./network_config";
type Access = "allow" | "deny";
interface OriginPolicy {
  access?: Access | null;
  uploads?: Access | null;
  downloads?: Access | null;
  fullCdpAccess?: Access | null;
  autoReview?: Access | null;
  persistentApproval?: boolean | null;
  accessApprovalLifetime?: "turn" | "thread" | null;
}
interface ManagedBrowserPolicy {
  origins?: Record<string, OriginPolicy | null>;
  defaultOriginPolicy?: OriginPolicy;
}
interface LocalOriginPolicy {
  access?: Access;
  uploads?: Access;
  downloads?: Access;
  full_cdp_access?: Access;
}
interface LocalBrowserPolicy {
  origins?: Record<string, LocalOriginPolicy | null>;
  default_origin_policy?: LocalOriginPolicy;
}
function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol !== "http:" && url.protocol !== "https:" ? null : url;
  } catch {
    return null;
  }
}
/** Original up/LC/Es: special sandbox URLs are accepted only on the original host family. */
export function parsePolicyOrigin(value: string) {
  const http = parseHttpUrl(value);
  if (http != null) return http;
  try {
    const url = new URL(value);
    return (url.protocol === "codex-sandbox:" || url.protocol === "https:") &&
      [
        "web-sandbox.oaiusercontent.com",
        "staging-web-sandbox.oaiusercontent.com",
      ].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      ) &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
      ? url
      : null;
  } catch {
    return null;
  }
}
function localPolicy(
  policy: LocalOriginPolicy | null | undefined,
): OriginPolicy | undefined {
  if (policy != null)
    return {
      access: policy.access,
      uploads: policy.uploads,
      downloads: policy.downloads,
      fullCdpAccess: policy.full_cdp_access,
    };
}
function restrictive<T>(
  managed: T | null | undefined,
  local: T | null | undefined,
  denied: T,
) {
  return managed === denied || local === denied
    ? denied
    : (managed ?? local ?? null);
}
/** Original uL counts canonical collisions before dropping missing or nonmatching policies. */
export function matchingOriginPolicy(
  entries: Array<[string, OriginPolicy | null | undefined]>,
  defaults: OriginPolicy | undefined,
  url: URL,
) {
  const parsed = entries.map(([value, policy]) => ({
    pattern: parseOriginPattern(value),
    policy,
  }));
  const counts = new Map<string, number>();
  for (const { pattern } of parsed)
    if (pattern != null)
      counts.set(
        pattern.canonicalKey,
        (counts.get(pattern.canonicalKey) ?? 0) + 1,
      );
  const matching = parsed.flatMap(({ pattern, policy }) =>
    pattern == null || policy == null || !originPatternMatches(pattern, url)
      ? []
      : [
          {
            policy,
            acceptsPermissiveValues: counts.get(pattern.canonicalKey) === 1,
          },
        ],
  );
  function select<K extends keyof OriginPolicy>(
    key: K,
    denied: OriginPolicy[K],
  ) {
    let selected: OriginPolicy[K] | null = null;
    for (const { policy, acceptsPermissiveValues } of matching) {
      const value = policy[key];
      if (value === denied) return value;
      if (acceptsPermissiveValues && value != null) selected = value;
    }
    return selected ?? defaults?.[key] ?? null;
  }
  return {
    access: select("access", "deny"),
    uploads: select("uploads", "deny"),
    downloads: select("downloads", "deny"),
    fullCdpAccess: select("fullCdpAccess", "deny"),
    autoReview: select("autoReview", "deny"),
    persistentApproval: select("persistentApproval", false),
    accessApprovalLifetime: select("accessApprovalLifetime", "turn"),
  };
}
/** Original cL/lL/es; invalid origins preserve the original permissive defaults of this layer. */
export function resolveOriginPolicy(
  managed: ManagedBrowserPolicy | null | undefined,
  local: LocalBrowserPolicy | null | undefined,
  origin: string,
) {
  const url = parsePolicyOrigin(origin);
  const managedPolicy =
    url == null
      ? null
      : matchingOriginPolicy(
          Object.entries(managed?.origins ?? {}),
          managed?.defaultOriginPolicy,
          url,
        );
  const configuredPolicy =
    url == null
      ? null
      : matchingOriginPolicy(
          Object.entries(local?.origins ?? {}).map(([pattern, policy]) => [
            pattern,
            localPolicy(policy),
          ]),
          localPolicy(local?.default_origin_policy),
          url,
        );
  const result = {
    access:
      restrictive(managedPolicy?.access, configuredPolicy?.access, "deny") ??
      "allow",
    uploads:
      restrictive(managedPolicy?.uploads, configuredPolicy?.uploads, "deny") ??
      "allow",
    downloads:
      restrictive(
        managedPolicy?.downloads,
        configuredPolicy?.downloads,
        "deny",
      ) ?? "allow",
    fullCdpAccess:
      restrictive(
        managedPolicy?.fullCdpAccess,
        configuredPolicy?.fullCdpAccess,
        "deny",
      ) ?? "allow",
    autoReview:
      restrictive(
        managedPolicy?.autoReview,
        configuredPolicy?.autoReview,
        "deny",
      ) ?? "allow",
    persistentApproval:
      restrictive(
        managedPolicy?.persistentApproval,
        configuredPolicy?.persistentApproval,
        false,
      ) ?? true,
    accessApprovalLifetime:
      restrictive(
        managedPolicy?.accessApprovalLifetime,
        configuredPolicy?.accessApprovalLifetime,
        "turn",
      ) ?? "thread",
  };
  return result.access === "deny"
    ? {
        ...result,
        uploads: "deny",
        downloads: "deny",
        fullCdpAccess: "deny",
        autoReview: "deny",
      }
    : result;
}
export function originPolicyFromConfig(
  origin: string,
  requirements?: Requirements | null,
  snapshot?: ConfigSnapshot | null,
) {
  return resolveOriginPolicy(
    requirements?.requirements?.browserUse,
    snapshot?.config.browser_use,
    origin,
  );
}
interface PolicyConfig {
  readRequirements(): Promise<Requirements | null | undefined>;
  readAll(): Promise<ConfigSnapshot | null | undefined>;
}
export async function readOriginPolicy(origin: string, config: PolicyConfig) {
  const [requirements, snapshot] = await Promise.all([
    config.readRequirements(),
    config.readAll(),
  ]);
  return originPolicyFromConfig(origin, requirements, snapshot);
}
/** Original QC/l5 returns null for non-HTTP inputs before testing network enablement. */
export function networkPolicyDecision(
  origin: string,
  network: EffectiveNetworkConfig,
) {
  const hostname = parseHttpUrl(origin)?.hostname ?? null;
  if (hostname == null) return null;
  if (network.enabled === false) return "deny";
  const denied = parseHostPatterns(network.deniedDomains, {
    allowGlobalWildcard: false,
  });
  const allowed = parseHostPatterns(network.allowedDomains, {
    allowGlobalWildcard: true,
  });
  return denied == null ||
    allowed == null ||
    anyHostPatternMatches(denied, hostname)
    ? "deny"
    : !network.hardDenyAllowlistMisses ||
        anyHostPatternMatches(allowed, hostname)
      ? null
      : "deny";
}
export async function isOriginBlockedByPolicy(
  origin: string,
  config: PolicyConfig,
) {
  const [requirements, snapshot] = await Promise.all([
    config.readRequirements(),
    config.readAll(),
  ]);
  return networkPolicyDecision(
    origin.replace(/^codex-sandbox:/, "https:"),
    effectiveNetworkConfig(requirements, snapshot),
  ) === "deny"
    ? true
    : originPolicyFromConfig(origin, requirements, snapshot).access === "deny";
}
