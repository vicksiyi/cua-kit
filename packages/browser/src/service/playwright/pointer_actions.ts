import { PlaywrightPointerFrames } from "./pointer_frames";
import type { PointerPoint, FrameBoundary } from "./pointer_frames";
import type { LocatorRequest } from "./input_preparation";
import type { CdpTarget } from "../cdp/dispatch_helpers";
export interface ScrollAlignment {
  block: ScrollLogicalPosition;
  inline: ScrollLogicalPosition;
}
export const defaultPointerAlignment: ScrollAlignment = {
  block: "center",
  inline: "nearest",
};
export const pointerAlignments: ScrollAlignment[] = [
  defaultPointerAlignment,
  { block: "end", inline: "end" },
  { block: "start", inline: "start" },
];
export interface PointerActionTarget {
  frameBoundaries: FrameBoundary[];
  inputPoint: PointerPoint;
  inputTarget: CdpTarget;
  point: PointerPoint;
  target: CdpTarget;
}
/** Original ig.resolvePointerActionTarget callback; serialized without external dependencies. */
export async function preparePagePointer(
  element: any,
  injected: any,
  options: { requiredStates: string[]; scrollAlignment: ScrollAlignment },
  scope: any,
) {
  const stability = {
    async waitForAnimationFrame() {
      await new Promise<void>((resolve) => {
        const frameWindow = element.ownerDocument?.defaultView;
        if (typeof frameWindow?.requestAnimationFrame === "function") {
          const timer =
            typeof frameWindow.setTimeout === "function"
              ? frameWindow.setTimeout(() => {
                  frameWindow.cancelAnimationFrame?.(animation);
                  resolve();
                }, 50)
              : undefined;
          const animation = frameWindow.requestAnimationFrame(() => {
            if (timer != null) frameWindow.clearTimeout(timer);
            resolve();
          });
          return;
        }
        if (typeof frameWindow?.setTimeout === "function") {
          frameWindow.setTimeout(resolve, 0);
          return;
        }
        resolve();
      });
    },
    sameRect(first: any, second: any) {
      return (
        first.left === second.left &&
        first.top === second.top &&
        first.width === second.width &&
        first.height === second.height
      );
    },
    async waitForStableBoundingRect() {
      let previous = element.getBoundingClientRect(),
        stable = 0;
      for (let attempt = 0; attempt < 10; attempt++) {
        await stability.waitForAnimationFrame();
        const current = element.getBoundingClientRect();
        if (stability.sameRect(previous, current)) {
          stable++;
          previous = current;
          if (stable >= 2) break;
          continue;
        }
        stable = 0;
        previous = current;
      }
      return previous;
    },
  };
  for (const state of options.requiredStates) {
    const result = injected.elementState(element, state);
    if (result.received === "error:notconnected")
      throw new Error("Element is not connected");
    if (!result.matches) throw new Error("Element is not " + state);
  }
  element.scrollIntoView({
    block: options.scrollAlignment.block,
    inline: options.scrollAlignment.inline,
    behavior: "instant",
  });
  const rect = await stability.waitForStableBoundingRect();
  for (const state of options.requiredStates) {
    const result = injected.elementState(element, state);
    if (result.received === "error:notconnected")
      throw new Error("Element is not connected");
    if (!result.matches) throw new Error("Element is not " + state);
  }
  if (!rect || rect.width <= 0 || rect.height <= 0)
    throw new Error("Element does not have a clickable bounding box");
  return scope.prepareFrameChainForPointerAction(
    {
      x: Math.max(0, rect.left + rect.width / 2),
      y: Math.max(0, rect.top + rect.height / 2),
    },
    options.scrollAlignment,
  );
}
/** Original ig pointer preparation/dispatch orchestration. Dispatch is supplied by the action caller. */
export class PlaywrightPointerActions extends PlaywrightPointerFrames {
  async performPointerAction(
    request: LocatorRequest,
    options: {
      force?: boolean;
      requiredStates: string[];
      timeoutMs?: number;
      actionName: string;
      dispatch: (target: PointerActionTarget) => Promise<unknown>;
    },
  ) {
    const alignments = options.force
      ? [defaultPointerAlignment]
      : pointerAlignments;
    let obstruction: string | null = null;
    for (const scrollAlignment of alignments) {
      const target = await this.resolvePointerActionTarget(request, {
        requiredStates: options.requiredStates,
        scrollAlignment,
      });
      obstruction = options.force
        ? null
        : await this.obstructingFrameHitTarget(target, {
            timeoutMs: options.timeoutMs,
          });
      if (obstruction == null) {
        await options.dispatch(target);
        return;
      }
    }
    throw new Error(
      `Element does not receive pointer events at the ${options.actionName} point; ${obstruction ?? "another element"} intercepts the ${options.actionName}`,
    );
  }
  async resolvePointerActionTarget(
    request: LocatorRequest,
    options: { requiredStates: string[]; scrollAlignment?: ScrollAlignment },
  ): Promise<PointerActionTarget> {
    const evaluated = await this.evaluateOnPlaywrightSelectorWithTarget(
      request.tab_id,
      request.selector,
      preparePagePointer,
      {
        arg: {
          requiredStates: options.requiredStates,
          scrollAlignment: options.scrollAlignment ?? defaultPointerAlignment,
        },
        timeoutMs: request.timeout_ms,
      },
    );
    const resolved = await this.currentTopLevelPointForAction(
      evaluated.result,
      evaluated.oopifFrameChain,
      { timeoutMs: request.timeout_ms },
    );
    return {
      frameBoundaries: resolved.frameBoundaries,
      inputPoint: evaluated.result,
      inputTarget: evaluated.target,
      point: resolved.point,
      target: evaluated.target,
    };
  }
}
