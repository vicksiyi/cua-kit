import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { inputTimeout } from "../input/input";
import { waitForNetworkIdle, type NetworkIdleCdp } from "../cdp/network_idle";
import { rejectBlockedNavigation } from "../cdp/page_load";
import type { FrameEvent } from "../cdp/frame_methods";
export interface WaitPayload {
  tab_id: unknown;
  state?: string;
  timeout_ms?: number;
  max?: number;
  url?: unknown;
  wait_until?: string;
}
export interface WaitContext {
  acquireAuthority(): {
    observeContent(url: unknown): { assert(): Promise<unknown> };
  };
  security: { currentTabUrl(tabId: number): Promise<unknown> };
  cdp: NetworkIdleCdp & {
    readDocumentState(
      tabId: number,
    ): Promise<{ readyState?: string; href?: string } | undefined>;
    waitForEvent(
      tabId: number,
      predicate: (event: FrameEvent) => boolean,
      options: {
        timeoutMs: number;
        timeoutMessage: string;
        initialCheck(): Promise<boolean>;
      },
    ): Promise<FrameEvent | undefined>;
  };
}
const isBlocked = (event: FrameEvent) =>
  event.method === "Page.navigationBlocked" &&
  event.params.resourceType !== "subFrame";
/** Original Bv/nre/ore. A complete document satisfies both load states. */
export async function waitForLoadState(
  tab: unknown,
  state: string | undefined,
  timeoutMs: number,
  context: WaitContext,
) {
  const tabId = positiveTabId(tab),
    kind = state ?? "load";
  if (kind === "networkidle") {
    await waitForNetworkIdle(context.cdp, tabId, timeoutMs);
    return;
  }
  await context.cdp.call(tabId, "Page.enable", {});
  const event = await context.cdp.waitForEvent(
    tabId,
    (event) =>
      event.source.sessionId == null &&
      (isBlocked(event) ||
        (kind === "domcontentloaded" &&
          event.method === "Page.domContentEventFired") ||
        event.method === "Page.loadEventFired"),
    {
      timeoutMs,
      timeoutMessage: `Timed out waiting for ${kind} in tab ${tabId}.`,
      initialCheck: async () => {
        const ready = (await context.cdp.readDocumentState(tabId))?.readyState;
        return (
          (kind === "domcontentloaded" && ready === "interactive") ||
          ready === "complete"
        );
      },
    },
  );
  rejectBlockedNavigation(event);
}
/** Original sre: a single star does not cross slash, double star does. */
export function urlGlobPattern(glob: string) {
  let result = "^";
  for (let index = 0; index < glob.length;) {
    const char = glob[index];
    if (char == null) break;
    if (char === "*") {
      const double = glob[index + 1] === "*";
      result += double ? ".*" : "[^/]*";
      index += double ? 2 : 1;
      continue;
    }
    result += /[\\.^$|()[\]{}+?]/.test(char) ? `\\${char}` : char;
    index++;
  }
  return `${result}$`;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}
function stringField(value: unknown, key: string) {
  if (isObject(value) && typeof value[key] === "string") return value[key];
}
/** Original R2/Dc/Dv. Unknown main-frame identity still excludes child frame navigations. */
export function navigationMatchedUrl(
  event: FrameEvent,
  frameId: string | undefined,
  matches: (url: string) => boolean,
) {
  if (event.method === "Page.navigatedWithinDocument") {
    if (frameId != null && stringField(event.params, "frameId") !== frameId)
      return;
    const url = stringField(event.params, "url");
    return url != null && matches(url) ? url : undefined;
  }
  if (
    event.method !== "Page.frameNavigated" ||
    !isObject(event.params) ||
    !isObject(event.params.frame)
  )
    return;
  const frame = event.params.frame,
    id = stringField(frame, "id"),
    parentId = stringField(frame, "parentId");
  if (frameId != null ? id !== frameId : parentId != null) return;
  const url = stringField(frame, "url");
  return url != null && matches(url) ? url : undefined;
}
async function waitAfterUrl(
  payload: WaitPayload,
  timeout: number,
  context: WaitContext,
) {
  switch (payload.wait_until) {
    case "load":
    case "domcontentloaded":
    case "networkidle":
      await waitForLoadState(
        payload.tab_id,
        payload.wait_until,
        timeout,
        context,
      );
  }
}
/** Original C2. Authority is checked before tab validation. */
export const PlaywrightWaitForLoadStateCommand = defineCommand(
  "playwright_wait_for_load_state",
  async (payload: WaitPayload, context: WaitContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    await waitForLoadState(
      payload.tab_id,
      payload.state,
      inputTimeout(payload),
      context,
    );
    return {};
  },
);
/** Original A2: uses the supplied duration directly, without Ve clamping. */
export const PlaywrightWaitForTimeoutCommand = defineCommand(
  "playwright_wait_for_timeout",
  async (payload: WaitPayload) => {
    positiveTabId(payload.tab_id);
    await new Promise((resolve) => setTimeout(resolve, payload.timeout_ms));
    return {};
  },
);
/** Original I2/P2/ire. Each post-URL load wait gets the original full timeout. */
export const PlaywrightWaitForUrlCommand = defineCommand(
  "playwright_wait_for_url",
  async (payload: WaitPayload, context: WaitContext) => {
    await context
      .acquireAuthority()
      .observeContent(
        await context.security.currentTabUrl(Number(payload.tab_id)),
      )
      .assert();
    if (typeof payload.url !== "string" || !payload.url)
      throw new Error("playwright_wait_for_url requires a url");
    const tabId = positiveTabId(payload.tab_id),
      timeout = inputTimeout(payload),
      pattern = new RegExp(urlGlobPattern(payload.url)),
      matches = (url: string) => pattern.test(url);
    await context.cdp.call(tabId, "Page.enable", {});
    let state = await context.cdp.readDocumentState(tabId);
    if (state?.href && matches(state.href)) {
      await waitAfterUrl(payload, timeout, context);
      return { url: state.href };
    }
    let frameId: string | undefined;
    try {
      frameId = (await context.cdp.call(tabId, "Page.getFrameTree")).frameTree
        ?.frame?.id;
    } catch {}
    const event = await context.cdp.waitForEvent(
      tabId,
      (event) =>
        event.source.sessionId == null &&
        (isBlocked(event) ||
          navigationMatchedUrl(event, frameId, matches) != null),
      {
        timeoutMs: timeout,
        timeoutMessage: `Timed out waiting for URL ${payload.url} in tab ${tabId}.`,
        initialCheck: async () => {
          state = await context.cdp.readDocumentState(tabId);
          return state?.href != null && matches(state.href);
        },
      },
    );
    rejectBlockedNavigation(event);
    const url = event
      ? navigationMatchedUrl(event, frameId, matches)
      : state?.href;
    await waitAfterUrl(payload, timeout, context);
    return url == null ? {} : { url };
  },
);
