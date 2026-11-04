import { parseRequestHeaders } from "./request_headers";
export interface ViewportSize {
  height: number;
  width: number;
}
export interface TabLease {
  tabId: number;
  sessionId: string;
  turnId: string;
  origin: "agent" | "user";
  claimedAt: number;
  instanceId: string | null;
  state: "active" | "handoff";
  requestHeaders?: Array<{ name: string; value: string }>;
  requestHeaderEnabled?: boolean;
  mark?: "handoff" | "deliverable";
  isActiveHandoff?: boolean;
  viewportSize?: ViewportSize | null;
}
/** Original Du. Null is an explicit viewport reset; undefined means absent or invalid. */
export function parseLeaseViewport(
  value: any,
): ViewportSize | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return;
  if (
    typeof value.width !== "number" ||
    !Number.isInteger(value.width) ||
    value.width <= 0 ||
    typeof value.height !== "number" ||
    !Number.isInteger(value.height) ||
    value.height <= 0
  )
    return;
  return { height: value.height, width: value.width };
}
/** Original Sy. Keep the original numeric checks rather than imposing safe/positive tab IDs. */
export function parseTabLease(value: any): TabLease | null {
  if (!value || typeof value !== "object") return null;
  if (
    typeof value.tabId !== "number" ||
    !Number.isInteger(value.tabId) ||
    typeof value.sessionId !== "string" ||
    typeof value.turnId !== "string" ||
    (value.origin !== "agent" && value.origin !== "user") ||
    typeof value.claimedAt !== "number" ||
    !Number.isFinite(value.claimedAt) ||
    (value.instanceId !== null && typeof value.instanceId !== "string") ||
    (value.state !== "active" && value.state !== "handoff")
  )
    return null;
  let headers;
  try {
    if (value.requestHeaders !== undefined)
      headers = parseRequestHeaders(value.requestHeaders);
  } catch {
    return null;
  }
  const viewport = parseLeaseViewport(value.viewportSize);
  return {
    tabId: value.tabId,
    sessionId: value.sessionId,
    turnId: value.turnId,
    origin: value.origin,
    claimedAt: value.claimedAt,
    instanceId: value.instanceId,
    state: value.state,
    requestHeaders: headers,
    requestHeaderEnabled:
      typeof value.requestHeaderEnabled === "boolean"
        ? value.requestHeaderEnabled
        : undefined,
    ...(value.mark === "handoff" || value.mark === "deliverable"
      ? { mark: value.mark }
      : {}),
    ...(typeof value.isActiveHandoff === "boolean"
      ? { isActiveHandoff: value.isActiveHandoff }
      : {}),
    ...(viewport !== undefined ? { viewportSize: viewport } : {}),
  };
}
/** Original Ey. Invalid entries are ignored; storage object keys must match tabId numerically. */
export function parseStoredLeases(value: any): Map<number, TabLease> {
  if (
    !value ||
    typeof value !== "object" ||
    !("leases" in value) ||
    !value.leases ||
    typeof value.leases !== "object" ||
    Array.isArray(value.leases)
  )
    return new Map();
  const leases = new Map<number, TabLease>();
  for (const [key, raw] of Object.entries(value.leases)) {
    const tabId = Number(key),
      lease = parseTabLease(raw);
    if (Number.isInteger(tabId) && lease != null && lease.tabId === tabId)
      leases.set(tabId, lease);
  }
  return leases;
}
/** Original Ty. Pending viewport keys are session IDs, and may contain arbitrary strings. */
export function parsePendingViewports(
  value: any,
): Map<string, { turnId: string; viewportSize: ViewportSize | null }> {
  if (
    !value ||
    typeof value !== "object" ||
    !("pendingViewportSizes" in value) ||
    !value.pendingViewportSizes ||
    typeof value.pendingViewportSizes !== "object" ||
    Array.isArray(value.pendingViewportSizes)
  )
    return new Map();
  const pending = new Map<
    string,
    { turnId: string; viewportSize: ViewportSize | null }
  >();
  for (const [sessionId, raw] of Object.entries(value.pendingViewportSizes)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as any,
      viewport = parseLeaseViewport(entry.viewportSize);
    if (typeof entry.turnId === "string" && viewport !== undefined)
      pending.set(sessionId, { turnId: entry.turnId, viewportSize: viewport });
  }
  return pending;
}
/** Original Iy: intentionally excludes mutable header, viewport and mark fields. */
export function matchesSourceLease(
  current: TabLease | null | undefined,
  source: TabLease,
): boolean {
  return (
    current != null &&
    current.tabId === source.tabId &&
    current.sessionId === source.sessionId &&
    current.turnId === source.turnId &&
    current.origin === source.origin &&
    current.claimedAt === source.claimedAt &&
    current.instanceId === source.instanceId &&
    current.state === source.state &&
    current.isActiveHandoff === source.isActiveHandoff
  );
}
