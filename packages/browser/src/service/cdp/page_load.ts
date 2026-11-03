import type { CdpTarget } from "./dispatch_helpers";
import { isNestedTarget } from "./dispatch_helpers";
import type { FrameEvent } from "./frame_methods";
import {
  isMainDocumentNavigation,
  isRootFrameNavigation,
} from "./frame_methods";
import { BrowserUseSecurityError } from "../errors/browser_security_error";
/** Original Mte: URL displayed in navigation rejection, with credentials/query/hash removed. */
export function navigationDisplayUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    const result = url.toString();
    return url.pathname === "/" ? result.slice(0, -1) : result;
  } catch {
    return null;
  }
}
/** Original Wn. */
export function rejectBlockedNavigation(event?: FrameEvent) {
  if (event == null || event.method !== "Page.navigationBlocked") return;
  const url = navigationDisplayUrl(event.params.url) ?? "this page";
  throw new BrowserUseSecurityError(
    "browser_navigation_blocked",
    `Browser Use is not permitted on ${url}.`,
  );
}
/** Original Ote keeps object inputs as-is. */
export function pageLoadTarget(input: unknown): CdpTarget {
  if (typeof input === "object") return input as CdpTarget;
  const tabId = Number(input);
  if (!Number.isFinite(tabId))
    throw new Error("waitForPageLoadEvent requires numeric tab_id");
  return { tabId };
}
export interface PageLoadOwner {
  mainFrameIdsByTabId: Map<number, string>;
  addListener(event: string, listener: (event: FrameEvent) => void): unknown;
  removeListener(event: string, listener: (event: FrameEvent) => void): unknown;
}
export interface PageLoadOptions {
  classificationTimeoutMs?: number;
  timeoutMs?: number;
  rejectSubframeNavigationBlocked?: boolean;
}
/** Original qh.waitForPageLoadEvent. Classification timeout changes to load timeout at the first loading signal. */
export async function waitForPageLoadEvent(
  this: PageLoadOwner,
  input: unknown,
  options: PageLoadOptions,
) {
  const classificationTimeout = options.classificationTimeoutMs ?? 250;
  const rejectSubframes = options.rejectSubframeNavigationBlocked === true;
  const target = pageLoadTarget(input);
  const result = await new Promise<FrameEvent | undefined>((resolve) => {
    let loading = false;
    const navigatedFrames = new Set<string>();
    const finish = (event?: FrameEvent) => {
      this.removeListener("event", onEvent);
      clearTimeout(timer);
      resolve(event);
    };
    const onEvent = (event: FrameEvent) => {
      if (event.source.tabId !== target.tabId) return;
      const matches =
        target.sessionId != null
          ? event.source.sessionId === target.sessionId
          : target.targetId != null
            ? event.source.targetId === target.targetId
            : event.source.sessionId == null && event.source.targetId == null;
      if (!matches) return;
      if (
        event.method === "Page.navigationBlocked" &&
        (event.params.resourceType !== "subFrame" || rejectSubframes)
      ) {
        finish(event);
        return;
      }
      switch (event.method) {
        case "Page.navigatedWithinDocument":
          if (
            (isNestedTarget(target) ||
              isMainDocumentNavigation(event, this.mainFrameIdsByTabId)) &&
            !navigatedFrames.has(event.params.frameId)
          )
            finish(event);
          return;
        case "Page.frameStartedLoading":
        case "Page.frameNavigated":
          if (event.method === "Page.frameNavigated") {
            if (event.params.type === "BackForwardCacheRestore") {
              if (isNestedTarget(target) || isRootFrameNavigation(event))
                finish(event);
              return;
            }
            navigatedFrames.add(event.params.frame.id);
          }
          if (loading) return;
          loading = true;
          clearTimeout(timer);
          timer = setTimeout(finish, options.timeoutMs);
          return;
        case "Page.domContentEventFired":
        case "Page.loadEventFired":
          if (loading) finish(event);
          return;
      }
    };
    let timer = setTimeout(finish, classificationTimeout);
    this.addListener("event", onEvent);
  });
  rejectBlockedNavigation(result);
}
