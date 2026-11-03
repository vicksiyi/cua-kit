import { defineCommand } from "./define_command";
import {
  navigationDisplayUrl,
  rejectBlockedNavigation,
} from "../cdp/page_load";
import type { FrameEvent } from "../cdp/frame_methods";
import type { WaitForCdpEventOptions } from "../cdp/event_wait";
export interface NavigationFrame {
  id: string;
  loaderId?: string;
  [key: string]: unknown;
}
export interface UrlNavigationContext {
  acquireAuthority(): {
    triggerNetworkEgress(url: string): { assert(): Promise<unknown> };
  };
  followSessionTab(tabId: number): Promise<unknown>;
  documentResponses: object;
  getCurrentSessionId(): unknown;
  credentialObservationGate?: {
    epoch?: number;
    permitNavigatedDocument(
      tabId: number,
      loaderId: string,
      epoch: number,
    ): unknown;
  };
  cdp: {
    readDocumentState(tabId: number): Promise<{ href?: string } | undefined>;
    call(tabId: number, method: string, params?: object): Promise<any>;
    on(event: string, listener: (...args: any[]) => void): unknown;
    removeListener(event: string, listener: (...args: any[]) => void): unknown;
    waitForEvent(
      tabId: number,
      predicate: (event: FrameEvent) => boolean,
      options: WaitForCdpEventOptions,
    ): Promise<FrameEvent | undefined>;
  };
}
/** Original Hh. Invalid URL strings are deliberately retained for comparison. */
export function normalizeNavigationUrl(value: unknown) {
  if (typeof value === "string") {
    try {
      return new URL(value).href;
    } catch {
      return value;
    }
  }
}
/** Original XN. */
export function navigationUrlChanged(
  value: string | undefined,
  previous: string | undefined,
  target: string | undefined,
) {
  return value == null
    ? false
    : (target != null && value === target) ||
        (previous != null && value !== previous)
      ? true
      : previous == null && target == null;
}
/** Original Nte/Fte/Lte/Ute/qte/Iv. A matching frame/navigation signal must precede a load event. */
export function navigationCompletionPredicate({
  mainFrameId,
  previousUrl,
  targetUrl,
}: {
  mainFrameId?: string;
  previousUrl?: string;
  targetUrl?: string;
}) {
  let started = false;
  const object = (value: unknown): value is Record<string, any> =>
    typeof value === "object" && value != null;
  return (event: FrameEvent) => {
    if (event.method === "Page.navigatedWithinDocument")
      return navigationUrlChanged(
        normalizeNavigationUrl(event.params?.url),
        previousUrl,
        targetUrl,
      );
    if (
      event.method === "Page.frameNavigated" &&
      object(event.params) &&
      object(event.params.frame)
    ) {
      const frame = event.params.frame;
      if (
        mainFrameId != null ? frame.id === mainFrameId : !("parentId" in frame)
      ) {
        if (
          navigationUrlChanged(
            normalizeNavigationUrl(frame.url),
            previousUrl,
            targetUrl,
          )
        )
          started = true;
      }
    }
    if (
      event.method === "Page.frameStartedLoading" &&
      mainFrameId != null &&
      object(event.params) &&
      event.params.frameId === mainFrameId
    )
      started = true;
    return (
      started &&
      (event.method === "Page.domContentEventFired" ||
        event.method === "Page.loadEventFired")
    );
  };
}
/** Original KN. */
async function mainFrame(
  tabId: number,
  context: UrlNavigationContext,
): Promise<NavigationFrame | undefined> {
  try {
    return (await context.cdp.call(tabId, "Page.getFrameTree")).frameTree
      ?.frame;
  } catch {
    return;
  }
}
/** Original YN. GD is explicit until document response lease ownership is assembled. */
export function createNavigateTabUrlCommand(
  resetDocumentResponse: (responses: object, tabId: number) => Promise<void>,
) {
  return defineCommand(
    "navigate_tab_url",
    async (
      payload: { tab_id: unknown; url?: unknown; timeout_ms?: number },
      context: UrlNavigationContext,
    ) => {
      const tabId = Number(payload.tab_id);
      if (typeof payload.url !== "string" || !payload.url)
        throw new Error("navigate_tab_url requires a url");
      if (!Number.isInteger(tabId) || tabId <= 0)
        throw new Error("navigate_tab_url requires a positive integer tab_id");
      await context
        .acquireAuthority()
        .triggerNetworkEgress(payload.url)
        .assert();
      await context.followSessionTab(tabId);
      await resetDocumentResponse(context.documentResponses, tabId);
      const url = payload.url,
        timeoutMs =
          typeof payload.timeout_ms === "number" ? payload.timeout_ms : 10000;
      const abort = new AbortController(),
        epoch = context.credentialObservationGate?.epoch,
        session = context.getCurrentSessionId();
      const state = await context.cdp.readDocumentState(tabId),
        previousUrl = normalizeNavigationUrl(state?.href),
        targetUrl = normalizeNavigationUrl(url);
      await context.cdp.call(tabId, "Page.enable", {});
      const previousFrame = await mainFrame(tabId, context),
        frameId = previousFrame?.id;
      const completed = navigationCompletionPredicate({
        mainFrameId: frameId,
        previousUrl,
        targetUrl,
      });
      let currentFrame = previousFrame,
        startedNavigation: any,
        detached = false;
      const onEvent = (event: FrameEvent) => {
        if (
          event.source.tabId !== tabId ||
          event.source.sessionId != null ||
          event.source.targetId != null
        )
          return;
        if (
          event.method === "Page.frameStartedNavigating" &&
          event.params.frameId === frameId
        )
          startedNavigation = event.params;
        if (
          event.method === "Page.frameNavigated" &&
          event.params.frame.parentId == null
        )
          currentFrame = event.params.frame;
      };
      const onDetached = (id: number) => {
        if (id === tabId) detached = true;
      };
      context.cdp.on("event", onEvent);
      context.cdp.on("tabDetached", onDetached);
      const waited = context.cdp
        .waitForEvent(
          tabId,
          (event) =>
            event.source.sessionId == null &&
            ((event.method === "Page.navigationBlocked" &&
              event.params.resourceType !== "subFrame") ||
              completed(event)),
          {
            timeoutMs,
            timeoutMessage: `Timed out waiting for tab ${tabId} to navigate to ${url}.`,
            signal: abort.signal,
          },
        )
        .then(
          (event) => ({ event }),
          (error) => (abort.signal.aborted ? { event: undefined } : { error }),
        );
      try {
        const response = await context.cdp.call(tabId, "Page.navigate", {
          url,
        });
        if (response.errorText) {
          const display = navigationDisplayUrl(url) ?? "this page";
          throw new Error(
            `Browser Use cannot open ${display} in tab ${tabId}. Browser reported: ${response.errorText.replaceAll(url, display)}`,
          );
        }
        const result = await waited;
        if ("error" in result) throw result.error;
        rejectBlockedNavigation(result.event);
        if (epoch != null) {
          const observed = currentFrame,
            queried = await mainFrame(tabId, context);
          if (currentFrame === observed) currentFrame = queried;
          const sameDocument =
            startedNavigation?.navigationType === "sameDocument" ||
            startedNavigation?.navigationType === "historySameDocument";
          if (
            detached ||
            context.getCurrentSessionId() !== session ||
            response.isDownload === true ||
            response.loaderId == null ||
            currentFrame == null ||
            currentFrame.id !== response.frameId ||
            currentFrame.loaderId !== response.loaderId ||
            currentFrame.loaderId === previousFrame?.loaderId ||
            (startedNavigation != null &&
              !sameDocument &&
              startedNavigation.loaderId !== response.loaderId)
          )
            return {};
          context.credentialObservationGate!.permitNavigatedDocument(
            tabId,
            currentFrame.loaderId!,
            epoch,
          );
        }
      } finally {
        abort.abort();
        context.cdp.removeListener("event", onEvent);
        context.cdp.removeListener("tabDetached", onDetached);
      }
      return {};
    },
  );
}
