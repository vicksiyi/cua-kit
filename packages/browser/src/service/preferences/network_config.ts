export interface EffectiveNetworkConfig {
  enabled: boolean | null;
  allowedDomains: string[];
  deniedDomains: string[];
  hardDenyAllowlistMisses: boolean;
}
interface ManagedNetwork {
  enabled?: boolean | null;
  domains?: Record<string, unknown> | null;
  allowedDomains?: string[] | null;
  deniedDomains?: string[] | null;
  managedAllowedDomainsOnly?: boolean | null;
}
export interface Requirements {
  requirements?: { network?: ManagedNetwork | null; browserUse?: any };
}
export interface ConfigSnapshot {
  config: Record<string, any>;
}
function record(value: unknown): Record<string, any> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}
function booleanField(value: Record<string, any>, ...names: string[]) {
  for (const name of names)
    if (typeof value[name] === "boolean") return value[name] as boolean;
}
function stringArrayField(
  value: Record<string, any>,
  ...names: string[]
): string[] {
  for (const name of names) {
    const items = value[name];
    if (Array.isArray(items))
      return items.filter((item) => typeof item === "string");
  }
  return [];
}
function appendUnique(target: string[], values: string[]) {
  for (const value of values) if (!target.includes(value)) target.push(value);
}
function domainDecisions(
  domains: Record<string, unknown>,
): [string[], string[]] {
  const allowed: string[] = [],
    denied: string[] = [];
  for (const [domain, decision] of Object.entries(domains)) {
    if (decision === "allow") allowed.push(domain);
    else if (decision === "deny") denied.push(domain);
  }
  return [allowed, denied];
}
function managedDomains(network: ManagedNetwork): [string[], string[]] {
  if (network.domains != null) return domainDecisions(network.domains);
  return [network.allowedDomains ?? [], network.deniedDomains ?? []];
}
function configuredDomains(network: Record<string, any>): [string[], string[]] {
  const domains = record(network.domains);
  if (domains != null) return domainDecisions(domains);
  return [
    stringArrayField(network, "allowedDomains", "allowed_domains"),
    stringArrayField(network, "deniedDomains", "denied_domains"),
  ];
}
/** Original Doe: only the named default permissions profile contributes local network settings. */
export function selectedNetworkConfig(
  snapshot: ConfigSnapshot | null | undefined,
) {
  const config = snapshot?.config;
  if (config == null) return null;
  const selected = config.default_permissions;
  return typeof selected !== "string" || selected.trim().length === 0
    ? null
    : (record(record(record(config.permissions)?.[selected.trim()])?.network) ??
        null);
}
/** Original fS/Ooe/Moe/Noe/Foe/fL/$c/yg/Loe/hL/dL. Denials cannot be relaxed by local config. */
export function effectiveNetworkConfig(
  requirements?: Requirements | null,
  snapshot?: ConfigSnapshot | null,
): EffectiveNetworkConfig {
  const result: EffectiveNetworkConfig = {
    enabled: null,
    allowedDomains: [],
    deniedDomains: [],
    hardDenyAllowlistMisses: false,
  };
  const managed = requirements?.requirements?.network;
  if (managed != null) {
    if (managed.enabled != null && (!managed.enabled || result.enabled == null))
      result.enabled = managed.enabled;
    const [allowed, denied] = managedDomains(managed);
    appendUnique(result.allowedDomains, allowed);
    appendUnique(result.deniedDomains, denied);
    result.hardDenyAllowlistMisses = managed.managedAllowedDomainsOnly ?? false;
  }
  const configured = selectedNetworkConfig(snapshot);
  if (result.hardDenyAllowlistMisses) {
    if (configured != null) {
      if (booleanField(configured, "enabled") === false) result.enabled = false;
      const [, denied] = configuredDomains(configured);
      appendUnique(result.deniedDomains, denied);
    }
  } else if (configured != null) {
    const enabled = booleanField(configured, "enabled");
    if (enabled != null && (!enabled || result.enabled == null))
      result.enabled = enabled;
    const [allowed, denied] = configuredDomains(configured);
    appendUnique(result.allowedDomains, allowed);
    appendUnique(result.deniedDomains, denied);
  }
  return result;
}
export interface NetworkConstraint {
  kind: "domains" | "origins";
  mode: "denylist" | "allowlist";
  patterns: string[];
}
export interface SandboxNetworkPolicy {
  type: string;
  networkAccess?: boolean | string;
}
function sandboxAllowsNetwork(policy: SandboxNetworkPolicy) {
  switch (policy.type) {
    case "dangerFullAccess":
      return true;
    case "readOnly":
    case "workspaceWrite":
      return policy.networkAccess;
    case "externalSandbox":
      return policy.networkAccess === "enabled";
  }
}
/** Original gL/Uoe; Cs origin-pattern parsing remains an explicit dependency until restored. */
export function createNetworkPolicyBuilder(
  parseOriginPattern: (pattern: string) => { canonicalKey: string } | null,
) {
  return function buildNetworkPolicy(
    sandbox: SandboxNetworkPolicy | null | undefined,
    requirements?: Requirements | null,
    snapshot?: ConfigSnapshot | null,
    deniedOrigins: string[] = [],
  ) {
    if (sandbox == null)
      throw new Error("Effective sandbox network policy is unavailable");
    const network = effectiveNetworkConfig(requirements, snapshot);
    const constraints: NetworkConstraint[] = [
      { kind: "domains", mode: "denylist", patterns: network.deniedDomains },
      {
        kind: "origins",
        mode: "denylist",
        patterns: deniedOrigins.flatMap((origin) => {
          const trimmed = origin.trim();
          return trimmed.includes("://") ||
            /^[a-z][a-z0-9+.-]*:(?![0-9]+$)/iu.test(trimmed)
            ? [trimmed]
            : [`http://${trimmed}`, `https://${trimmed}`];
        }),
      },
    ];
    if (!sandboxAllowsNetwork(sandbox))
      constraints.push({ kind: "domains", mode: "allowlist", patterns: [] });
    if (network.enabled === false || network.hardDenyAllowlistMisses)
      constraints.push({
        kind: "domains",
        mode: "allowlist",
        patterns: network.enabled === false ? [] : network.allowedDomains,
      });
    const managed = requirements?.requirements?.browserUse,
      configured = snapshot?.config.browser_use;
    for (const source of [
      {
        origins: managed?.origins,
        defaultAccess: managed?.defaultOriginPolicy?.access,
      },
      {
        origins: configured?.origins,
        defaultAccess: configured?.default_origin_policy?.access,
      },
    ]) {
      const patterns = Object.entries(source.origins ?? {}).map(
        ([pattern, policy]) => ({
          pattern,
          key: parseOriginPattern(pattern)?.canonicalKey ?? pattern,
          access: (policy as any)?.access,
        }),
      );
      const counts = new Map<string, number>();
      for (const pattern of patterns)
        counts.set(pattern.key, (counts.get(pattern.key) ?? 0) + 1);
      constraints.push({
        kind: "origins",
        mode: "denylist",
        patterns: patterns
          .filter((pattern) => pattern.access === "deny")
          .map((pattern) => pattern.pattern),
      });
      if (source.defaultAccess === "deny")
        constraints.push({
          kind: "origins",
          mode: "allowlist",
          patterns: patterns
            .filter(
              (pattern) =>
                pattern.access === "allow" && counts.get(pattern.key) === 1,
            )
            .map((pattern) => pattern.pattern),
        });
    }
    return { constraints };
  };
}
