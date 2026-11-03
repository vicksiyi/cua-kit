import type { CdpTarget } from "../cdp/dispatch_helpers";
export interface NavigationState {
  revision: number;
  navigationRevision: number;
  loading: boolean;
  committed: boolean;
  painted: boolean;
  tabStatus?: string;
  documentId?: string;
  javaScriptDialogId?: string;
  url?: string;
  documentElementCount?: number;
  documentTextLength?: number;
}
/** Original Lv: repeated starts reset readiness without incrementing revisions twice. */
export function startNavigation(state: NavigationState): void {
  if (!state.loading) {
    state.revision += 1;
    state.navigationRevision += 1;
  }
  state.loading = true;
  state.committed = false;
  state.painted = false;
  state.tabStatus = "loading";
}
/** Original $h; session ID has precedence over target ID. */
export function accessibilityTargetKey(target: CdpTarget): string {
  return `${target.tabId}:${target.sessionId ?? target.targetId ?? "root"}`;
}
/** Original Lr. */
export function accessibilityDocumentKey(
  frameId?: string,
  loaderId?: string,
): string {
  return `${frameId ?? ""}:${loaderId ?? ""}`;
}
/** Original Uv: count parent edges, terminating cycles and missing parents. */
export function frameDepth<
  T extends { frameId: string; parentFrameId?: string },
>(frame: T, frames: Map<string, T>): number {
  const seen = new Set<string>();
  let depth = 0,
    current: T | undefined = frame;
  while (current?.parentFrameId != null && !seen.has(current.frameId)) {
    seen.add(current.frameId);
    depth++;
    current = frames.get(current.parentFrameId);
  }
  return depth;
}
/** Original W2: detect a small AX capture despite a substantial live document. */
export function needsCaptureRetry(
  elementCount: number,
  state: NavigationState,
): boolean {
  return state.documentElementCount != null &&
    state.documentElementCount >= Math.max(150, elementCount * 3)
    ? true
    : elementCount < 50 && (state.documentTextLength ?? 0) >= 4000;
}
/** Original jv. */
export function navigationChanged(
  previous: NavigationState,
  current: NavigationState,
): boolean {
  return (
    current.loading ||
    previous.navigationRevision !== current.navigationRevision ||
    previous.documentId !== current.documentId
  );
}
/** Original $2: dialog, paint and URL heuristics; intentionally ignores scheme, port, query and fragment for valid URLs. */
export function isCaptureUsable(
  candidate: { elementCount: number; url?: string },
  state: NavigationState,
): boolean {
  if (state.javaScriptDialogId != null) return candidate.elementCount >= 3;
  let sameLocation = true;
  if (state.url != null && candidate.url != null) {
    try {
      const current = new URL(state.url),
        captured = new URL(candidate.url);
      sameLocation =
        current.hostname === captured.hostname &&
        current.pathname === captured.pathname;
    } catch {
      sameLocation = state.url === candidate.url;
    }
  }
  return (
    (state.painted || state.tabStatus === "complete") &&
    candidate.elementCount >= 10 &&
    sameLocation
  );
}
