import {
  parseHostPattern,
  parseOriginPattern,
  hostPatternMatches,
  type HostPattern,
} from "@core/core/originPatterns";
import { intersectHostnames } from "./hostname_intersection";
import type { CompiledNetworkPolicy } from "./network_policy";
export interface NetworkPolicyConstraint {
  mode: "allowlist" | "denylist";
  kind: "domains" | "origins";
  patterns: string[];
}
type Pattern =
  | { document: string }
  | {
      hostname: HostPattern;
      origin: { protocol: string; port: string } | undefined;
    };
type Action = "allow" | "block";
function documentUrl(input: URL): string {
  const url = new URL(input.href);
  url.search = "";
  url.hash = "";
  return url.href;
}
function normalizePattern(value: string, kind: string): Pattern {
  if (kind === "origins") {
    const origin = parseOriginPattern(value);
    if (origin != null)
      return {
        hostname: origin.hostnamePattern,
        origin: { protocol: origin.protocol, port: origin.port },
      };
    const url = URL.parse(value);
    if (url == null)
      throw new Error("Unsupported network policy origin pattern");
    return { document: documentUrl(url) };
  }
  if (/[\s/]/u.test(value.trim()) || value.includes("\0"))
    throw new Error("Unsupported network policy domain pattern");
  const hostname = parseHostPattern(value);
  if (hostname == null || hostname.hostnamePattern.length === 0)
    throw new Error("Unsupported network policy domain pattern");
  return { hostname, origin: undefined };
}
function matches(pattern: Pattern, url: URL): boolean {
  if ("document" in pattern) return pattern.document === documentUrl(url);
  return (
    (pattern.origin == null ||
      (pattern.origin.protocol === url.protocol &&
        pattern.origin.port === url.port)) &&
    hostPatternMatches(pattern.hostname, url.hostname)
  );
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
/** Original Wp: conjunction of allow/deny policies, retaining URL parse failures. */
export function createNetworkPolicyPredicate(
  constraints: NetworkPolicyConstraint[],
): (url: string) => boolean {
  const policies = constraints.map((policy) => ({
    mode: policy.mode,
    patterns: policy.patterns.map((pattern) =>
      normalizePattern(pattern, policy.kind),
    ),
  }));
  return (value) => {
    const url = new URL(value);
    return policies.every((policy) => {
      const found = policy.patterns.some((pattern) => matches(pattern, url));
      return policy.mode === "allowlist" ? found : !found;
    });
  };
}
/** Original Vp: normalize/deduplicate, intersect allowlists, then emit deny rules. */
export function compileNetworkPolicy(
  constraints: NetworkPolicyConstraint[],
): CompiledNetworkPolicy {
  if (constraints.length > 128)
    throw new Error("Network policy exceeds the policy count budget");
  let inputBytes = 0,
    patternCount = 0;
  const normalized = constraints.map((policy) => {
    patternCount += policy.patterns.length;
    if (patternCount > 4096)
      throw new Error("Network policy exceeds the pattern count budget");
    const patterns = new Map<string, Pattern>();
    for (const pattern of policy.patterns) {
      inputBytes += new TextEncoder().encode(pattern).length;
      if (inputBytes > 65536)
        throw new Error("Network policy exceeds the input byte budget");
      const parsed = normalizePattern(pattern, policy.kind);
      patterns.set(JSON.stringify(parsed), parsed);
    }
    return {
      mode: policy.mode,
      patterns: [...patterns.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, pattern]) => pattern),
    };
  });
  const policies = [
    ...new Map(
      normalized.map((policy) => [JSON.stringify(policy), policy]),
    ).entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, policy]) => policy);
  const allowlists = policies.filter((policy) => policy.mode === "allowlist");
  if (allowlists.some((policy) => policy.patterns.length === 0))
    return { defaultAction: "block", rules: [] };
  const rules = new Map<string, { action: Action; regex: string }>();
  const budget = { states: 65536, bytes: 4 * 1024 * 1024 };
  let compiledBytes = 0,
    intersections = 0;
  function add(action: Action, regex: string) {
    const key = `${action}:${regex}`;
    if (!rules.has(key)) {
      compiledBytes += regex.length;
      if (compiledBytes > 65536 || rules.size >= 999)
        throw new Error("Network policy exceeds the compiled rule budget");
      rules.set(key, { action, regex });
    }
  }
  function countIntersection() {
    if (++intersections > 4096)
      throw new Error("Network policy exceeds the intersection budget");
  }
  function intersect(patterns: Pattern[], action: Action) {
    countIntersection();
    const document = patterns.find((pattern) => "document" in pattern);
    if (document != null) {
      const url = new URL(document.document);
      if (patterns.every((pattern) => matches(pattern, url)))
        add(action, `^${escapeRegex(document.document)}(?:[?#]|$)`);
      return;
    }
    const hosts = patterns.filter(
      (pattern): pattern is Exclude<Pattern, { document: string }> =>
        !("document" in pattern),
    );
    const origins = hosts.flatMap((pattern) =>
      pattern.origin == null ? [] : [pattern.origin],
    );
    const origin = origins[0];
    if (
      origins.some(
        (candidate) =>
          candidate.protocol !== origin?.protocol ||
          candidate.port !== origin.port,
      )
    )
      return;
    for (const kind of ["dns", "ipv6"] as const)
      for (const regex of intersectHostnames(
        hosts.map((pattern) => pattern.hostname),
        kind,
        budget,
      )) {
        const host = kind === "ipv6" ? `\\[${regex}\\]` : `${regex}\\.*`;
        const port =
          origin == null
            ? "(?::[0-9]+)?"
            : origin.port.length > 0
              ? `:${origin.port}`
              : "";
        add(
          action,
          `^${origin == null ? "[a-z][a-z0-9+.-]*:" : escapeRegex(origin.protocol)}//(?:[^/?#@]*@)?${host}${port}(?:[/?#]|$)`,
        );
      }
  }
  function combine(index: number, selected: Pattern[]) {
    const policy = allowlists[index];
    if (policy == null) {
      intersect(selected, "allow");
      return;
    }
    for (const pattern of policy.patterns) {
      countIntersection();
      if (
        !("document" in pattern) &&
        pattern.origin != null &&
        selected.some(
          (previous) =>
            !("document" in previous) &&
            previous.origin != null &&
            (previous.origin.protocol !== pattern.origin?.protocol ||
              previous.origin.port !== pattern.origin.port),
        )
      )
        continue;
      combine(index + 1, [...selected, pattern]);
    }
  }
  if (allowlists.length > 0) combine(0, []);
  for (const policy of policies)
    if (policy.mode === "denylist")
      for (const pattern of policy.patterns) intersect([pattern], "block");
  return {
    defaultAction: allowlists.length > 0 ? "block" : "allow",
    rules: [...rules.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, rule]) => rule),
  };
}
