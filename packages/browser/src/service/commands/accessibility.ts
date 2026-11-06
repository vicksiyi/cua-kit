import { observeSiwc, formatSiwcObservation } from "../siwc/observation";
import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { captureTabScreenshot } from "./screenshot";
import type { ScreenshotContext } from "./screenshot";
import { AccessibilityActionError } from "../accessibility/dialog_actions";
import { StaleAccessibilityCaptureError } from "../accessibility/state_store";
export interface AccessibilityCommandContext extends ScreenshotContext {
  acquireAuthority(): ReturnType<ScreenshotContext["acquireAuthority"]> & {
    actInFrame(url: unknown): { assert(): Promise<unknown> };
  };
  supportsTabCapability(id: string): Promise<boolean>;
  followSessionTab(tabId: number): Promise<unknown>;
  getCurrentSessionId(): string;
  ax: {
    performAction(tabId: number, action: unknown): Promise<unknown>;
    capture(
      tabId: number,
      content: string,
      options: { disableDiffing?: boolean },
      screenshot?: () => Promise<{ data?: unknown }>,
    ): Promise<{
      snapshotId?: string;
      state?: string;
      data?: unknown;
      screenshot_unavailable?: string;
    }>;
    discardCapture(tabId: number, capture: object): void;
    validateCapture(tabId: number, capture: object): void;
  };
}
/** Original z2: enrich only accessibility-action errors with a newly authorized, validated AX state. */
export const TabAXActionCommand = defineCommand(
  "tab_ax_action",
  async (
    payload: { tab_id: unknown; action: unknown },
    context: AccessibilityCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .actInFrame(await context.security.currentTabUrl(tabId))
      .assert();
    await context.followSessionTab(tabId);
    try {
      await context.ax.performAction(tabId, payload.action);
    } catch (error) {
      if (!(error instanceof AccessibilityActionError)) throw error;
      const capture = await context.ax.capture(tabId, "axState", {});
      await context
        .acquireAuthority()
        .observeContent(await context.security.currentTabUrl(tabId))
        .assert();
      context.ax.validateCapture(tabId, capture);
      throw new Error(`${error.message}\n\n${capture.state}`, { cause: error });
    }
    return {};
  },
);
/** Original eF: authorize before and after capture, retry stale captures once within the same session. */
export const TabAXGetStateCommand = defineCommand(
  "tab_ax_get_state",
  async (
    payload: { tab_id: unknown; content: string; disable_diffing?: boolean },
    context: AccessibilityCommandContext,
  ) => {
    const tabId = positiveTabId(payload.tab_id);
    await context
      .acquireAuthority()
      .observeContent(await context.security.currentTabUrl(tabId))
      .assert();
    const sessionId = context.getCurrentSessionId();
    for (let attempt = 0; ; attempt++) {
      let capture:
        | Awaited<ReturnType<AccessibilityCommandContext["ax"]["capture"]>>
        | undefined;
      try {
        capture = await context.ax.capture(
          tabId,
          payload.content,
          { disableDiffing: payload.disable_diffing || attempt > 0 },
          () =>
            captureTabScreenshot({ tab_id: payload.tab_id }, context, "css"),
        );
        await context
          .acquireAuthority()
          .observeContent(await context.security.currentTabUrl(tabId))
          .assert();
        context.ax.validateCapture(tabId, capture);
        if (
          payload.content === "screenshot" &&
          capture.screenshot_unavailable != null
        )
          throw new Error(capture.screenshot_unavailable);
        if (
          payload.content !== "screenshot" &&
          (await context.supportsTabCapability("siwc"))
        ) {
          const { siwc } = await observeSiwc(payload, context);
          await context
            .acquireAuthority()
            .observeContent(await context.security.currentTabUrl(tabId))
            .assert();
          context.ax.validateCapture(tabId, capture);
          return {
            ...capture,
            siwc,
            state: `${capture.state}\n\n${formatSiwcObservation(capture.snapshotId, siwc)}`,
          };
        }
        return capture;
      } catch (error) {
        if (capture != null) context.ax.discardCapture(tabId, capture);
        if (
          !(error instanceof StaleAccessibilityCaptureError) ||
          attempt > 0 ||
          context.getCurrentSessionId() !== sessionId
        )
          throw error;
        await context
          .acquireAuthority()
          .observeContent(await context.security.currentTabUrl(tabId))
          .assert();
        if (context.getCurrentSessionId() !== sessionId) throw error;
      }
    }
  },
);
