export interface HostPattern {
  canonicalPattern: string;
  hostnamePattern: string;
  kind: "exact" | "subdomains-only" | "apex-and-subdomains";
}
export interface OriginPattern {
  canonicalKey: string;
  canonicalPattern: string;
  hostnamePattern: HostPattern;
  port: string;
  protocol: string;
}
const encoder = new TextEncoder();
function trimWhitespace(value: string) {
  return value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
}
function isIp(value: string) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(value))
    return value
      .split(".")
      .every((part) => Number(part) <= 255 && String(Number(part)) === part);
  if (!value.includes(":") || /[^\da-f:.]/iu.test(value)) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 0;
  } catch {
    return false;
  }
}
function normalizeHost(value: string) {
  const host = value
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/\.+$/u, "");
  for (const marker of ["%25", "%"]) {
    const index = host.indexOf(marker);
    if (index === -1) continue;
    const address = host.slice(0, index);
    if (isIp(address)) return `${address}%${host.slice(index + marker.length)}`;
  }
  return host;
}
export function normalizeHostname(value: string) {
  const host = trimWhitespace(value);
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end !== -1) return normalizeHost(host.slice(1, end));
  }
  let colons = 0;
  for (const character of host) if (character === ":") colons++;
  return colons === 1
    ? normalizeHost(host.split(":")[0] ?? "")
    : normalizeHost(host);
}
function validHostPattern(value: string) {
  const trimmed = trimWhitespace(value);
  if (/[{}\\/\p{White_Space}]/u.test(trimmed)) return false;
  const host = trimmed.replace(/^\*\*?\./u, "");
  if (host.includes("**")) return false;
  if (!/[[\]]/u.test(host)) return true;
  const end = host.indexOf("]");
  if (!host.startsWith("[") || end === -1) return false;
  const inner = host.slice(1, end),
    suffix = host.slice(end + 1),
    normalized = normalizeHost(inner),
    address = normalized.split("%")[0] ?? "";
  return (
    !/[[\]]/u.test(inner + suffix) &&
    (normalized === "*" || (address.includes(":") && isIp(address))) &&
    (/^\.*$/u.test(suffix) || suffix.startsWith(":"))
  );
}
/** Original rl/Y8/J8 and normalization helpers. */
export function parseHostPattern(value: string): HostPattern | null {
  if (!validHostPattern(value)) return null;
  const trimmed = trimWhitespace(value);
  const pattern =
    trimmed === "*"
      ? "*"
      : trimmed.startsWith("**.")
        ? `**.${normalizeHostname(trimmed.slice(3))}`
        : trimmed.startsWith("*.")
          ? `*.${normalizeHostname(trimmed.slice(2))}`
          : normalizeHostname(trimmed);
  if (pattern === "" || pattern === "*." || pattern === "**.") return null;
  return pattern.startsWith("**.")
    ? {
        canonicalPattern: pattern,
        hostnamePattern: pattern.slice(3),
        kind: "apex-and-subdomains",
      }
    : pattern.startsWith("*.")
      ? {
          canonicalPattern: pattern,
          hostnamePattern: pattern.slice(2),
          kind: "subdomains-only",
        }
      : { canonicalPattern: pattern, hostnamePattern: pattern, kind: "exact" };
}
function asciiLower(byte: number | undefined) {
  return byte !== undefined && byte >= 65 && byte <= 90 ? byte + 32 : byte;
}
/** Original Py/Q8: wildcard matching operates on UTF-8 bytes, not Unicode characters. */
export function wildcardMatches(pattern: string, value: string) {
  const patternBytes = encoder.encode(pattern),
    bytes = encoder.encode(value);
  let patternIndex = 0,
    valueIndex = 0,
    starIndex = -1,
    retryIndex = 0;
  while (valueIndex < bytes.length) {
    if (patternBytes[patternIndex] === 42) {
      starIndex = patternIndex;
      patternIndex++;
      retryIndex = valueIndex;
    } else if (
      patternBytes[patternIndex] === 63 ||
      asciiLower(patternBytes[patternIndex]) === asciiLower(bytes[valueIndex])
    ) {
      patternIndex++;
      valueIndex++;
    } else if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      retryIndex++;
      valueIndex = retryIndex;
    } else return false;
  }
  while (patternBytes[patternIndex] === 42) patternIndex++;
  return patternIndex === patternBytes.length;
}
export function hostPatternMatches(pattern: HostPattern, hostname: string) {
  const host = normalizeHostname(hostname);
  switch (pattern.kind) {
    case "exact":
      return wildcardMatches(pattern.hostnamePattern, host);
    case "subdomains-only":
      return wildcardMatches(`?*.${pattern.hostnamePattern}`, host);
    case "apex-and-subdomains":
      return (
        wildcardMatches(pattern.hostnamePattern, host) ||
        wildcardMatches(`?*.${pattern.hostnamePattern}`, host)
      );
  }
}
export function parseHostPatterns(
  values: string[],
  options: { allowGlobalWildcard: boolean },
) {
  const patterns: HostPattern[] = [],
    seen = new Set<string>();
  for (const value of values) {
    const pattern = parseHostPattern(value);
    if (
      pattern == null ||
      (!options.allowGlobalWildcard &&
        pattern.hostnamePattern === "*" &&
        (pattern.kind === "exact" || pattern.kind === "apex-and-subdomains"))
    )
      return null;
    if (!seen.has(pattern.canonicalPattern)) {
      seen.add(pattern.canonicalPattern);
      patterns.push(pattern);
    }
  }
  return { patterns };
}
export function anyHostPatternMatches(
  parsed: { patterns: HostPattern[] },
  hostname: string,
) {
  return parsed.patterns.some((pattern) =>
    hostPatternMatches(pattern, hostname),
  );
}
function authorityHostname(authority: string) {
  if (authority.length === 0 || /[/#\\@]/u.test(authority)) return null;
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    if (end <= 1) return null;
    const suffix = authority.slice(end + 1);
    return suffix.length === 0 ||
      (suffix.startsWith(":") && /^\d+$/u.test(suffix.slice(1)))
      ? authority.slice(0, end + 1)
      : null;
  }
  const colon = authority.indexOf(":");
  if (colon === -1) return authority;
  if (colon !== authority.lastIndexOf(":")) return null;
  return /^\d+$/u.test(authority.slice(colon + 1))
    ? authority.slice(0, colon)
    : null;
}
function validAuthorityHost(host: string) {
  return host.startsWith("[")
    ? host.endsWith("]")
    : host.length === 0 || host.includes("%") || host.endsWith("..")
      ? false
      : host
          .replace(/\.$/u, "")
          .split(".")
          .every((label) => label.length > 0);
}
function unicodeWildcard(host: string) {
  return host.startsWith("[")
    ? false
    : host
        .replace(/\.$/u, "")
        .split(".")
        .some((label) => /[*?]/u.test(label) && /[^\p{ASCII}]/u.test(label));
}
/** Original Cs/r5/n5/o5/i5; paths, credentials and Unicode wildcard labels are rejected. */
export function parseOriginPattern(value: string): OriginPattern | null {
  if (value !== value.trim() || /\s/u.test(value)) return null;
  const separator = value.indexOf("://");
  if (separator <= 0) return null;
  const host = authorityHostname(value.slice(separator + 3));
  if (host == null || !validAuthorityHost(host) || unicodeWildcard(host))
    return null;
  try {
    const url = new URL(value.replaceAll("?", "*"));
    const normalized = host.includes("?")
      ? host
          .split(".")
          .map((label) =>
            /[*?]/u.test(label)
              ? label
              : new URL(`https://${label}.invalid`).hostname.slice(0, -8),
          )
          .join(".")
      : url.hostname.replace(/%2a/giu, "*");
    const pattern = parseHostPattern(normalized);
    if (pattern == null) return null;
    const formatted = normalized.startsWith("[")
      ? `[${pattern.canonicalPattern}]`
      : pattern.canonicalPattern;
    return {
      canonicalKey: JSON.stringify([
        url.protocol,
        pattern.canonicalPattern,
        url.port,
      ]),
      canonicalPattern: `${url.protocol}//${formatted}${url.port.length > 0 ? `:${url.port}` : ""}`,
      hostnamePattern: pattern,
      port: url.port,
      protocol: url.protocol,
    };
  } catch {
    return null;
  }
}
export function originPatternMatches(pattern: OriginPattern, url: URL) {
  return pattern.protocol !== url.protocol || pattern.port !== url.port
    ? false
    : hostPatternMatches(pattern.hostnamePattern, url.hostname);
}
