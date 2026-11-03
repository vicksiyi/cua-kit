import { parseOriginPattern, originPatternMatches } from "./origin_patterns";
export class ConfigReadError extends Error {
  source: string;
  constructor(source: string, cause: unknown) {
    super(`Browser Use could not read ${source}.`, { cause });
    this.source = source;
    this.name = "ConfigReadError";
  }
}
export interface PermissionResource {
  kind: string;
  origin: string;
  transferKind?: string;
}
export interface PermissionTableStore {
  get(key: string, options?: { refresh: boolean }): Promise<unknown>;
  readSnapshot?(options: { refresh: boolean }): Promise<Record<string, any>>;
  update(
    transform: (snapshot: Record<string, any>) => Record<string, any>,
  ): Promise<unknown>;
}
export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
export function validPreferenceSession(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}
export function permissionTableKey(resource: PermissionResource) {
  switch (resource.kind) {
    case "origin":
      return "origins";
    case "fileTransfer":
      return resource.transferKind === "download" ? "downloads" : "uploads";
    case "fullCdp":
      return "full_cdp";
  }
}
export function approvalModeKey(resource: PermissionResource) {
  switch (resource.kind) {
    case "origin":
      return "approval_mode";
    case "fileTransfer":
      return resource.transferKind === "download"
        ? "download_approval_mode"
        : "upload_approval_mode";
    case "fullCdp":
      return null;
  }
}
export function permissionOrigin(resource: PermissionResource) {
  switch (resource.kind) {
    case "origin":
    case "fileTransfer":
    case "fullCdp":
      return resource.origin;
  }
}
export function canPersistResource(resource: PermissionResource) {
  return permissionTableKey(resource) != null;
}
export function defaultsToConversation(resource: PermissionResource) {
  return resource.kind === "origin" || resource.kind === "fullCdp";
}
export function approvalMode(
  snapshot: Record<string, any>,
  resource: PermissionResource,
) {
  const key = approvalModeKey(resource);
  return key == null
    ? "always_ask"
    : snapshot[key] === "never_ask"
      ? "never_ask"
      : "always_ask";
}
export function historyModeKey(backend: string) {
  return backend === "iab"
    ? "iab_history_approval_mode"
    : "history_approval_mode";
}
export function historyApprovalMode(
  snapshot: Record<string, any>,
  backend: string,
) {
  const mode = snapshot[historyModeKey(backend)];
  return mode === "never_ask"
    ? "never_ask"
    : mode === "disabled"
      ? "disabled"
      : "always_ask";
}
export function promptPersistence(result: {
  _meta?: unknown;
  content?: unknown;
}) {
  for (const value of [result._meta, result.content]) {
    const persist = isRecord(value) ? value.persist : undefined;
    if (persist === "session") return "conversation";
    if (persist === "always") return "global";
  }
  return null;
}
export function promptApprovesAllSites(result: {
  _meta?: unknown;
  content?: unknown;
}) {
  for (const value of [result._meta, result.content])
    if (
      isRecord(value) &&
      value.browser_use_persistent_approval_scope === "all-sites"
    )
      return true;
  return false;
}
export function isUserReviewed(result: {
  _meta?: { approvals_reviewer?: unknown };
}) {
  const reviewer = result._meta?.approvals_reviewer;
  return reviewer == null || reviewer === "user";
}
export async function readPermissionSnapshot(
  store: PermissionTableStore,
  keys: string[],
  refresh = false,
) {
  if (refresh) {
    if (store.readSnapshot == null)
      throw new ConfigReadError(
        "config",
        new Error("Browser-use config cannot refresh a complete snapshot"),
      );
    return store.readSnapshot({ refresh: true });
  }
  const entries = await Promise.all(
    keys.map(async (key) => [key, await store.get(key)]),
  );
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}
export function permissionTable(
  snapshot: Record<string, any>,
  key: string | null | undefined,
) {
  if (key == null) return null;
  const value = snapshot[key];
  return isRecord(value) ? value : null;
}
function ensureTable(snapshot: Record<string, any>, key: string) {
  const value = snapshot[key];
  if (value == null) {
    const table = {};
    snapshot[key] = table;
    return table;
  }
  if (!isRecord(value))
    throw new Error(`browser-use table ${key} must be an object`);
  return value;
}
function addEntry(table: Record<string, any>, key: string, value: string) {
  const current = table[key];
  if (current == null) {
    table[key] = [value];
    return;
  }
  if (!Array.isArray(current))
    throw new Error(`browser-use table key ${key} must be an array`);
  const entries = current.filter((entry) => typeof entry === "string");
  if (!entries.includes(value)) entries.push(value);
  table[key] = entries;
}
function removeEntry(table: Record<string, any>, key: string, value: string) {
  const entries = table[key];
  if (Array.isArray(entries))
    table[key] = entries.filter((entry) => entry !== value);
}
export function escapePermissionPattern(value: string) {
  let result = "";
  for (const character of value)
    result +=
      character === "*" ? "\\*" : character === "\\" ? "\\\\" : character;
  return result;
}
function splitPattern(pattern: string) {
  const parts: string[] = [];
  let part = "";
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === "*") {
      parts.push(part);
      part = "";
      continue;
    }
    if (character === "\\") {
      const next = pattern[index + 1];
      if (next === "*" || next === "\\") {
        part += next;
        index++;
        continue;
      }
    }
    part += character;
  }
  parts.push(part);
  return parts;
}
/** Original Cy/K8 fallback is case-sensitive and treats only unescaped '*' as wildcard. */
export function persistedPatternMatches(pattern: string, value: string) {
  const parts = splitPattern(pattern);
  if (parts.length === 1) return parts[0] === value;
  const [prefix = ""] = parts;
  let remaining = value;
  if (prefix.length > 0) {
    if (!remaining.startsWith(prefix)) return false;
    remaining = remaining.slice(prefix.length);
  }
  for (const part of parts.slice(1, -1)) {
    if (part.length === 0) continue;
    const index = remaining.indexOf(part);
    if (index === -1) return false;
    remaining = remaining.slice(index + part.length);
  }
  const suffix = parts.at(-1) ?? "";
  return suffix.length === 0 || remaining.endsWith(suffix);
}
export interface PermissionTarget {
  raw: string;
  hostPort: string | null;
}
export function storedOriginMatches(pattern: string, target: PermissionTarget) {
  const parsed = parseOriginPattern(pattern);
  let url: URL | null;
  try {
    url = new URL(target.raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") url = null;
  } catch {
    url = null;
  }
  if (parsed != null && url != null) return originPatternMatches(parsed, url);
  return pattern.includes("://")
    ? persistedPatternMatches(pattern, target.raw)
    : target.hostPort != null
      ? persistedPatternMatches(pattern, target.hostPort)
      : !target.raw.includes("://") &&
        persistedPatternMatches(pattern, target.raw);
}
export function tableMatchesPermission(
  table: Record<string, any>,
  key: string,
  target: PermissionTarget,
) {
  const entries = table[key];
  return Array.isArray(entries)
    ? entries.some(
        (entry) =>
          typeof entry === "string" &&
          storedOriginMatches(entry.trim(), target),
      )
    : false;
}
function hostPort(value: string) {
  const separator = value.indexOf("://");
  if (separator === -1) return null;
  const scheme = value.slice(0, separator);
  if (scheme.toLowerCase() !== "http" && scheme.toLowerCase() !== "https")
    return null;
  const authority = value.slice(separator + 3),
    end = authority.search(/[/?#]/u);
  const host =
    (end === -1 ? authority : authority.slice(0, end))
      .split("@")
      .at(-1)
      ?.trim() ?? "";
  return host.length > 0 ? host : null;
}
export function permissionTarget(
  resource: PermissionResource,
): PermissionTarget {
  const raw = permissionOrigin(resource) as string;
  const host =
    resource.kind === "origin" ||
    resource.kind === "fileTransfer" ||
    resource.kind === "fullCdp"
      ? hostPort(resource.origin)
      : null;
  return { raw, hostPort: host != null && host !== raw ? host : null };
}
/** Original Qoe: clone the top level and selected table, then remove opposite raw/escaped entries. */
export async function persistPermission(
  config: {
    global: PermissionTableStore;
    session(id: string): PermissionTableStore;
  },
  request: { resource: PermissionResource; preferenceSessionId?: string },
  scope: string,
  decision: string,
) {
  const key = permissionTableKey(request.resource);
  if (key == null) return;
  const store =
    scope === "global"
      ? config.global
      : validPreferenceSession(request.preferenceSessionId)
        ? config.session(request.preferenceSessionId)
        : undefined;
  if (store != null)
    await store.update((snapshot) => {
      const result = { ...snapshot },
        current = result[key];
      if (isRecord(current)) result[key] = { ...current };
      const table = ensureTable(result, key),
        [add, remove] =
          decision === "approve"
            ? ["allowed", "denied"]
            : ["denied", "allowed"];
      const raw = permissionOrigin(request.resource) as string,
        escaped = escapePermissionPattern(raw);
      removeEntry(table, remove, raw);
      if (escaped !== raw) removeEntry(table, remove, escaped);
      addEntry(table, add, escaped);
      return result;
    });
}
