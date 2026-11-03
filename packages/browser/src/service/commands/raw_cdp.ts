import { CdpCall, CdpEvents } from "../../commands/tab_developer";
import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { prepareRawCdpParams, rawCdpAuthorityUrls } from "../cdp/raw_policy";
import type { EnvironmentSource } from "../capability_filter";
import type { RawEventOptions } from "../cdp/raw_event_methods";
/** Original Bs with Qt/zr: only exact string 1 enables hosted CDP. */
export function supportsFullCdp(runtime: EnvironmentSource, type: string) {
  switch (type) {
    case "mcpapps":
      return false;
    case "extension":
    case "iab":
      return true;
    case "cdp": {
      const mode = runtime.env.BROWSER_USE_SECURITY_MODE;
      return (
        typeof mode === "string" &&
        mode.trim() === "gaas-browser-environment" &&
        runtime.env.BROWSER_USE_FULL_CDP_ACCESS_ENABLED === "1"
      );
    }
  }
}
interface CdpAuthority {
  useCdp(url: string): CdpAuthority;
  assert(): Promise<unknown>;
}
export interface RawCdpCommandContext {
  runtime: EnvironmentSource;
  clientInfo: { type: string };
  acquireAuthority(): {
    actInFrame(url: string): { assert(): Promise<unknown> };
    observeContent(url: string): { assert(): Promise<unknown> };
    useCdp(url: string): CdpAuthority;
  };
  security: {
    currentTabUrl(tabId: number): Promise<string>;
    currentTabFullCdpUrl(tabId: number): Promise<string>;
  };
  documentResponses: {
    hasRequestInterceptors(tabId: number): boolean;
    hasOwnedPausedResponses(tabId: number): boolean;
    ensureInterceptionReady(tabId: number): Promise<unknown>;
  };
  cdp: {
    hasBrowserAuthRawEventProtection(tabId: number): boolean;
    callRawCdp(
      tabId: number,
      method: string,
      params: Record<string, unknown> | undefined,
      options: {
        beforeDispatch(): void;
        prepareDispatch(): Promise<unknown>;
        target?: { sessionId?: string; targetId?: string };
        timeoutMs: number;
      },
    ): Promise<unknown>;
    readRawCdpEvents(tabId: number, options: RawEventOptions): Promise<unknown>;
  };
}
/** Original Jh. */
export function rawCdpTarget(target?: {
  session_id?: string;
  target_id?: string;
}) {
  if (target != null)
    return { sessionId: target.session_id, targetId: target.target_id };
}
const unavailable =
  "Full CDP access is currently only available for browser extension and in-app browser tabs.";
/** Original sF. Dispatch rechecks protection after permission acquisition and interception setup. */
export const TabCdpCallCommand = defineCommand(
  CdpCall,
  async (
    payload: { tab_id: unknown; [key: string]: unknown },
    context: RawCdpCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    if (!supportsFullCdp(context.runtime, context.clientInfo.type))
      throw new Error(unavailable);
    const parsed = CdpCall.PayloadSchema.parse(payload),
      target = rawCdpTarget(parsed.target),
      params = prepareRawCdpParams(parsed.method, parsed.params, {
        preserveDocumentInterception: target == null,
      });
    const check = () => {
      if (context.cdp.hasBrowserAuthRawEventProtection(tabId))
        throw new Error(
          "Raw CDP is unavailable while Browser Use is protecting credential saving.",
        );
      if (
        context.documentResponses.hasRequestInterceptors(tabId) &&
        (parsed.method.startsWith("Fetch.") ||
          parsed.method.startsWith("Network.") ||
          parsed.method.startsWith("Target."))
      )
        throw new Error(
          "Raw CDP is unavailable while Browser Use is protecting a browser request.",
        );
      if (context.documentResponses.hasOwnedPausedResponses(tabId))
        throw new Error(
          "Raw CDP is unavailable while Browser Use is resolving a paused document response.",
        );
    };
    check();
    const urls = rawCdpAuthorityUrls(parsed.method, params),
      url = await context.security.currentTabFullCdpUrl(tabId),
      authority = context.acquireAuthority().useCdp(url);
    for (const affected of urls) authority.useCdp(affected);
    await authority.assert();
    return (
      (await context.cdp.callRawCdp(tabId, parsed.method, params, {
        beforeDispatch: check,
        prepareDispatch: () =>
          context.documentResponses.ensureInterceptionReady(tabId),
        target,
        timeoutMs: parsed.timeout_ms ?? 3000,
      })) ?? {}
    );
  },
);
/** Original aF. Event reads use observation followed by full-CDP authority. */
export const TabCdpEventsCommand = defineCommand(
  CdpEvents,
  async (
    payload: { tab_id: unknown; [key: string]: unknown },
    context: RawCdpCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    if (!supportsFullCdp(context.runtime, context.clientInfo.type))
      throw new Error(unavailable);
    const parsed = CdpEvents.PayloadSchema.parse(payload),
      url = await context.security.currentTabFullCdpUrl(tabId);
    await context.acquireAuthority().useCdp(url).assert();
    return await context.cdp.readRawCdpEvents(tabId, {
      afterSequence: parsed.after_sequence,
      limit: parsed.limit,
      methods: parsed.methods,
      target: rawCdpTarget(parsed.target),
      timeoutMs: parsed.timeout_ms,
    });
  },
);
