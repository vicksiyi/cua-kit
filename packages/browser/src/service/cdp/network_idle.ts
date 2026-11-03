import type { FrameEvent } from "./frame_methods";
import { isNestedTarget } from "./dispatch_helpers";
import { rejectBlockedNavigation } from "./page_load";
export interface NetworkIdleCdp {
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
  call(
    tabId: number,
    method: string,
    params?: any,
    options?: { deadlineMs: number; preserveDebuggerOnTimeout: boolean },
  ): Promise<any>;
}
/** Original T2: lifecycle networkIdle must belong to the current root frame and loader. */
export async function waitForNetworkIdle(
  cdp: NetworkIdleCdp,
  tabId: number,
  timeoutMs: number,
) {
  const deadlineMs = Date.now() + timeoutMs;
  const options = { deadlineMs, preserveDebuggerOnTimeout: true };
  let frame: { id: string; loaderId?: string } | undefined;
  let idle = false;
  const buffered: FrameEvent[] = [];
  let failure: Error | undefined;
  let wake = Promise.withResolvers<void>();
  const notify = () => wake.resolve();
  const timeout = () =>
    new Error(`Timed out waiting for networkidle in tab ${tabId}.`);
  function onEvent(event: FrameEvent) {
    if (
      event.source.tabId !== tabId ||
      isNestedTarget({ ...event.source, tabId })
    )
      return;
    if (
      event.method === "Page.navigationBlocked" &&
      event.params.resourceType !== "subFrame"
    ) {
      try {
        rejectBlockedNavigation(event);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
    } else if (
      event.method === "Page.frameNavigated" ||
      event.method === "Page.lifecycleEvent"
    ) {
      if (frame == null) {
        buffered.push(event);
        return;
      }
      if (event.method === "Page.frameNavigated") {
        if (event.params.frame.parentId != null) return;
        if (
          frame.id !== event.params.frame.id ||
          frame.loaderId !== event.params.frame.loaderId
        ) {
          frame = event.params.frame;
          idle = false;
        }
      } else if (
        event.params.name === "networkIdle" &&
        event.params.frameId === frame.id &&
        event.params.loaderId === frame.loaderId
      )
        idle = true;
    } else return;
    notify();
  }
  function onDetach(id: number) {
    if (id === tabId) {
      failure ??= new Error(
        `Tab ${tabId} detached while waiting for networkidle.`,
      );
      notify();
    }
  }
  cdp.on("event", onEvent);
  cdp.on("tabDetached", onDetach);
  try {
    await cdp.call(tabId, "Page.enable", {}, options);
    const { frameTree } = await cdp.call(
      tabId,
      "Page.getFrameTree",
      undefined,
      options,
    );
    frame = frameTree.frame;
    for (const event of buffered) onEvent(event);
    buffered.length = 0;
    await cdp.call(
      tabId,
      "Page.setLifecycleEventsEnabled",
      { enabled: true },
      options,
    );
    for (;;) {
      if (failure != null) throw failure;
      if (Date.now() >= deadlineMs) throw timeout();
      if (idle) return;
      wake = Promise.withResolvers<void>();
      const timer = setTimeout(notify, deadlineMs - Date.now());
      try {
        await wake.promise;
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    throw failure ?? (Date.now() >= deadlineMs ? timeout() : error);
  } finally {
    cdp.removeListener("event", onEvent);
    cdp.removeListener("tabDetached", onDetach);
  }
}
