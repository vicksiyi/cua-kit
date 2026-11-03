import { clickKeys } from "../input/keyboard_keys";
import { assertOpenRoots } from "../input/input_guard";
import { keyboardDispatch } from "../input/index";
import {
  callElementFunction,
  createSetAccessibilityValue,
} from "./element_execution";
import { optionActivationMode, activateSelectOption } from "./selection";
import {
  positionAccessibilityTarget,
  AccessibilityHitError,
} from "./position_target";
import { activateAccessibilityTarget } from "./prepare_action";
import { coordinateTarget } from "./scroll_action";
import type { GeometryContext, GeometryTarget } from "./target_geometry";
export type ClickTarget = GeometryTarget & {
  isOptionElement?: boolean;
  actionDescriptions: string[];
};
export type ClickContext = GeometryContext &
  Omit<Parameters<typeof activateAccessibilityTarget>[0], "ax"> & {
    cdp: Parameters<typeof keyboardDispatch.withHeldKeys>[0] &
      GeometryContext["cdp"];
    ax: {
      targetForElement(tabId: number, id: number): ClickTarget;
      trackDeferredPageLoad(tabId: number, promise: Promise<unknown>): unknown;
    };
    playwright: {
      evaluateOnPlaywrightNode(
        target: ClickTarget,
        fn: typeof activateSelectOption,
      ): Promise<unknown>;
    };
    cua: { clickPoint(request: any): Promise<unknown> };
  };
export interface ClickOptions {
  button?: string;
  clickCount: number;
  key?: string;
  durationMs?: number;
  signal?: AbortSignal;
}
/** Original $v, assembled entirely from restored helpers; Playwright node evaluation is supplied by the host context. */
export async function clickAccessibilityTarget(
  context: ClickContext,
  tabId: number,
  value: number | number[],
  options: ClickOptions,
): Promise<void> {
  const button =
    options.button === "right" || options.button === "r"
      ? "right"
      : options.button === "middle" || options.button === "m"
        ? "middle"
        : "left";
  const keys =
    options.key == null
      ? undefined
      : clickKeys(options.key, context.cdp.platform);
  const simple =
    button === "left" &&
    options.clickCount === 1 &&
    (options.durationMs ?? 0) === 0 &&
    keys == null;
  const target =
    typeof value === "number"
      ? context.ax.targetForElement(tabId, value)
      : undefined;
  if (context.isIabBackend && target != null) {
    await assertOpenRoots(context.cdp, target.target, target.backendNodeId);
    let frame = context.ax.frameForId(tabId, target.frameId);
    if (frame == null)
      throw new Error("Click target frame is no longer available");
    while (frame.parentFrameId != null) {
      const parent = context.ax.frameForId(tabId, frame.parentFrameId);
      if (parent == null || frame.ownerBackendNodeId == null)
        throw new Error("Click target's parent frame is no longer available");
      await assertOpenRoots(
        context.cdp,
        parent.target,
        frame.ownerBackendNodeId,
      );
      frame = parent;
    }
  }
  if (
    target?.isOptionElement &&
    simple &&
    (await callElementFunction(context, target, optionActivationMode, {})) ===
      "select-option"
  ) {
    await context.playwright.evaluateOnPlaywrightNode(
      target,
      activateSelectOption,
    );
    return;
  }
  let geometry:
    Awaited<ReturnType<typeof positionAccessibilityTarget>> | undefined;
  if (target != null) {
    const fallback = simple && !target.isOptionElement;
    try {
      geometry = await positionAccessibilityTarget(
        context,
        tabId,
        target,
        fallback,
      );
    } catch (error) {
      if (!fallback || !(error instanceof AccessibilityHitError)) throw error;
      await activateAccessibilityTarget(context, tabId, target);
      return;
    }
  }
  const point =
    geometry?.point ?? (await coordinateTarget(context, tabId, value)).point;
  const dispatch = async (modifiers: number) => {
    options.signal?.throwIfAborted();
    if (target != null) context.ax.targetForElement(tabId, target.id);
    await context.cua.clickPoint({
      button,
      clickCount: options.clickCount,
      deferPageLoadWait: (promise: Promise<unknown>) =>
        context.ax.trackDeferredPageLoad(tabId, promise),
      inputPoint: geometry?.inputPoint,
      inputTarget: geometry?.target,
      loadTarget: geometry?.target,
      modifiers,
      point,
      tabId,
      durationMs: options.durationMs,
      signal: options.signal,
    });
  };
  if (keys == null) await dispatch(0);
  else
    await keyboardDispatch.withHeldKeys(
      context.cdp,
      geometry?.target ?? { tabId },
      keys,
      { signal: options.signal, blockClosedShadowInput: context.isIabBackend },
      dispatch,
    );
}
/** Original Rre. */
export async function performSecondaryAction(
  context: ClickContext,
  tabId: number,
  action: { element_index: number; action: string },
): Promise<void> {
  const target = context.ax.targetForElement(tabId, action.element_index);
  if (
    (action.action !== "Expand" && action.action !== "Collapse") ||
    !target.actionDescriptions.includes(action.action)
  )
    throw new Error(
      `Accessibility element ${action.element_index} does not support secondary action ${JSON.stringify(action.action)}`,
    );
  await clickAccessibilityTarget(context, tabId, action.element_index, {
    clickCount: 1,
  });
}
/** Ire now uses the restored full $v path. */
const setValue = createSetAccessibilityValue(
  async (context, tabId, id, options) =>
    clickAccessibilityTarget(context as ClickContext, tabId, id, options),
);

export async function setAccessibilityValue(
  context: ClickContext,
  tabId: number,
  id: number,
  value: string,
): Promise<void> {
  await setValue(context, tabId, id, value);
}
