import { isNestedTarget } from "../cdp/dispatch_helpers";
import type { CdpTarget } from "../cdp/dispatch_helpers";
import { callElementFunction } from "./element_execution";
import type {
  AccessibilityTarget,
  AccessibilityExecutionContext,
} from "./element_execution";
import { activateElement } from "./activation";
import { AccessibilityActionError } from "./dialog_actions";
interface InputContext {
  ax: { targetForElement(tabId: number, id: number): AccessibilityTarget };
  playwright: {
    focusNode(
      target: AccessibilityTarget,
      options: { requireEditable: boolean; timeoutMs: number },
    ): Promise<{
      target: CdpTarget;
      executionContextId?: number;
      inputTargetToken?: string;
    }>;
  };
}
/** Original Hv: preserve pre-abort versus wrapped post-focus abort behavior. */
export async function prepareAccessibilityInput(
  context: InputContext,
  tabId: number,
  id: number | null | undefined,
  options: { signal: AbortSignal; requireEditable: boolean },
) {
  options.signal.throwIfAborted();
  if (id == null) return { target: { tabId }, executionContextId: undefined };
  try {
    const target = context.ax.targetForElement(tabId, id);
    const result = await context.playwright.focusNode(target, {
      requireEditable: options.requireEditable,
      timeoutMs: 3000,
    });
    options.signal.throwIfAborted();
    return result;
  } catch (error) {
    throw new AccessibilityActionError(
      `Could not prepare accessibility element ${id} for input within ${3000} ms. No input was sent. ${String(error)}`,
      { cause: error },
    );
  }
}
interface ActivationContext extends AccessibilityExecutionContext {
  ax: {
    targetForElement(tabId: number, id: number): AccessibilityTarget;
    trackDeferredPageLoad(tabId: number, promise: Promise<unknown>): unknown;
  };
  cdp: AccessibilityExecutionContext["cdp"] & {
    waitForPageLoadEvent(
      target: number | CdpTarget,
      options: { timeoutMs: number; rejectSubframeNavigationBlocked?: boolean },
    ): Promise<unknown>;
  };
}
/** Original Are: observe navigation before native activation; defer load result to AX state. */
export async function activateAccessibilityTarget(
  context: ActivationContext,
  tabId: number,
  target: AccessibilityTarget,
): Promise<void> {
  context.ax.targetForElement(tabId, target.id);
  const loaded = isNestedTarget(target.target)
    ? Promise.all([
        context.cdp.waitForPageLoadEvent(target.target, { timeoutMs: 3000 }),
        context.cdp.waitForPageLoadEvent(tabId, {
          rejectSubframeNavigationBlocked: true,
          timeoutMs: 3000,
        }),
      ])
    : context.cdp.waitForPageLoadEvent(tabId, { timeoutMs: 3000 });
  const ignored = loaded.catch(() => {});
  try {
    await callElementFunction(context, target, activateElement, {});
  } catch (error) {
    await ignored;
    throw error;
  }
  context.ax.trackDeferredPageLoad(tabId, loaded);
}
