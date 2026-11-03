import { PlaywrightPointerActions } from "./pointer_actions";
import type { PointerPoint } from "./pointer_frames";
import type { LocatorRequest } from "./input_preparation";
import type { FrameRoutingCdp } from "./frame_routing";
import type { LocatorTiming } from "./retry";
import type { PlaywrightPerformanceSpan } from "./selector_execution";
import { positiveTabId } from "../tab_id";
import { inputTimeout } from "../input/input";
import { modifierMask } from "../input/keyboard_keys";
import { isNestedTarget } from "../cdp/dispatch_helpers";
/** Original bF. */
export function locatorButton(value: unknown): "left" | "right" | "middle" {
  return value === "right" || value === "middle" ? value : "left";
}
/** Original yF. Serialized into the selected document, with no module dependencies. */
export function syntheticDocumentClick(
  element: any,
  injected: any,
  point: PointerPoint,
) {
  const root = document.documentElement;
  const inDocument = (node: any) =>
    node.ownerDocument === document &&
    node.isConnected &&
    node.getRootNode({ composed: true }) === document;
  const hitTarget = () => {
    let hit: any = document.elementFromPoint(point.x, point.y);
    while (hit?.shadowRoot != null) {
      const inner = hit.shadowRoot.elementFromPoint(point.x, point.y);
      if (inner == null || inner === hit) break;
      hit = inner;
    }
    return hit;
  };
  const target = hitTarget();
  if (target == null) throw new Error("Click target moved or became obscured.");
  const validate = () => {
    if (
      document.documentElement !== root ||
      !root.isConnected ||
      !inDocument(element) ||
      !inDocument(target)
    )
      throw new Error("Click target left the selected document.");
    if (
      hitTarget() !== target ||
      injected.expectHitTarget(point, element) !== "done"
    )
      throw new Error("Click target moved or became obscured.");
  };
  const activeElement = () => {
    let active: any = document.activeElement;
    while (active?.shadowRoot?.activeElement)
      active = active.shadowRoot.activeElement;
    return active;
  };
  const focus = () => {
    const previous = activeElement();
    for (let candidate = target; candidate != null && inDocument(candidate);) {
      if (
        (candidate instanceof HTMLElement || candidate instanceof SVGElement) &&
        !candidate.matches("iframe, object, embed")
      ) {
        candidate.focus({ preventScroll: true });
        if (activeElement() !== previous || activeElement() === candidate)
          return;
      }
      const tree = candidate.getRootNode();
      candidate =
        candidate.assignedSlot ??
        candidate.parentElement ??
        (tree instanceof ShadowRoot ? tree.host : null);
    }
    if (previous instanceof HTMLElement || previous instanceof SVGElement)
      previous.blur();
  };
  let pointerDownPrevented = false;
  for (const type of [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ]) {
    validate();
    if (pointerDownPrevented && (type === "mousedown" || type === "mouseup"))
      continue;
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      button: 0,
      buttons: type.endsWith("down") ? 1 : 0,
      detail: 1,
      pointerId: -1,
      pointerType: "mouse",
      isPrimary: true,
    };
    const event =
      type === "mousedown" || type === "mouseup"
        ? new MouseEvent(type, init)
        : new PointerEvent(type, init);
    target.dispatchEvent(event);
    if (type === "pointerdown") pointerDownPrevented = event.defaultPrevented;
    if (type === "mousedown" && !event.defaultPrevented) {
      validate();
      focus();
    }
  }
}
export interface LocatorClickRequest extends LocatorRequest {
  button?: unknown;
  modifiers?: string[];
  force?: boolean;
  max?: number;
}
export interface LocatorClickBackend {
  clickPoint(options: {
    button: "left" | "middle" | "right";
    clickCount: number;
    modifiers: number;
    point: PointerPoint;
    tabId: number;
    timeoutMs: number;
    inputPoint?: PointerPoint;
    inputTarget?: import("../cdp/dispatch_helpers").CdpTarget;
    loadTarget?: import("../cdp/dispatch_helpers").CdpTarget;
  }): Promise<unknown>;
}
/** Original ig.clickLocator; CUA click backend remains explicit at construction. */
export class PlaywrightClick extends PlaywrightPointerActions {
  declare cdp: FrameRoutingCdp & { platform: string };
  declare beforeDocumentClick:
    ((point: PointerPoint) => Promise<unknown>) | undefined;
  constructor(
    cdp: FrameRoutingCdp & { platform: string },
    injectedSource: string,
    commandTiming: LocatorTiming,
    performanceSpan: PlaywrightPerformanceSpan,
    public cua: LocatorClickBackend,
    isIabBackend = false,
    public executionPolicy: {
      documentOnly?: boolean;
      clickDispatch?: string;
    } = {},
  ) {
    super(
      cdp,
      injectedSource,
      commandTiming,
      performanceSpan,
      isIabBackend,
      executionPolicy,
    );
  }
  async clickLocator(request: LocatorClickRequest, clickCount: number) {
    const tabId = positiveTabId(request.tab_id),
      timeoutMs = inputTimeout(request),
      button = locatorButton("button" in request ? request.button : undefined),
      modifiers = modifierMask(
        "modifiers" in request ? request.modifiers : undefined,
        this.cdp.platform,
      ),
      force = "force" in request ? request.force === true : false;
    if (
      this.executionPolicy.clickDispatch === "synthetic" &&
      (button !== "left" || modifiers !== 0 || force || clickCount !== 1)
    )
      throw new Error(
        "Document-scoped clicks support only unmodified left clicks without force.",
      );
    const requiredStates = force ? [] : ["visible", "enabled"];
    await this.performPointerAction(request, {
      actionName: clickCount === 1 ? "click" : "dblclick",
      dispatch: async (target) => {
        if (this.executionPolicy.clickDispatch === "synthetic") {
          await this.beforeDocumentClick?.(target.point);
          await this.evaluateOnPlaywrightSelector(
            request.tab_id,
            request.selector,
            syntheticDocumentClick,
            { arg: target.point, retry: false, timeoutMs },
          );
          return;
        }
        await this.cua.clickPoint({
          button,
          clickCount,
          ...(isNestedTarget(target.target)
            ? {
                inputPoint: target.inputPoint,
                inputTarget: target.inputTarget,
                loadTarget: target.target,
              }
            : {}),
          modifiers,
          point: target.point,
          tabId,
          timeoutMs,
        });
      },
      force,
      requiredStates,
      timeoutMs,
    });
  }
}
