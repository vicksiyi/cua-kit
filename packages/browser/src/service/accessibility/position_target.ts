import { inspectTargetGeometry } from "./target_geometry";
import type { GeometryContext, GeometryTarget } from "./target_geometry";
import { callElementFunction } from "./element_execution";
import { scrollElementIntoView } from "./activation";
/** Original ou: callers distinguish inaccessible targets from unsettled geometry. */
export class AccessibilityHitError extends Error {}
/** Original V2/Sre/xre/Ere: poll at 25 ms, wait 500 ms, accept geometry deltas up to 0.5 px. */
export async function positionAccessibilityTarget(
  context: GeometryContext,
  tabId: number,
  target: GeometryTarget,
  stopWhenCovered = false,
) {
  const initial = await inspectTargetGeometry(context, tabId, target);
  if (initial.kind === "hittable") return initial.point;
  await context.cdp
    .callTarget(target.target, "DOM.scrollIntoViewIfNeeded", {
      backendNodeId: target.backendNodeId,
    })
    .catch((error) => {
      throw error instanceof Error &&
        error.message.includes("Node does not have a layout object")
        ? new AccessibilityHitError(
            `Element ${target.id} couldn't be clicked. Try another element.`,
            { cause: error },
          )
        : error;
    });
  const scrolled = await inspectTargetGeometry(context, tabId, target);
  if (scrolled.kind === "hittable") return scrolled.point;
  if (scrolled.kind === "unpositioned")
    throw new AccessibilityHitError(
      `Element ${target.id} couldn't be clicked. Try another element.`,
    );
  await callElementFunction(context, target, scrollElementIntoView, {});
  const deadline = Date.now() + 500;
  let previous: Awaited<ReturnType<typeof inspectTargetGeometry>> | undefined;
  for (;;) {
    const current = await inspectTargetGeometry(context, tabId, target);
    const point = current.kind !== "unpositioned" ? current.point : undefined;
    const prior =
      previous != null && previous.kind !== "unpositioned"
        ? previous.point
        : undefined;
    const stable =
      current.kind === previous?.kind &&
      point != null &&
      prior != null &&
      [
        point.inputPoint.x - prior.inputPoint.x,
        point.inputPoint.y - prior.inputPoint.y,
        point.point.x - prior.point.x,
        point.point.y - prior.point.y,
        point.width - prior.width,
        point.height - prior.height,
      ].every((delta) => Math.abs(delta) <= 0.5);
    if (stable && current.kind === "hittable") return current.point;
    if (
      Date.now() >= deadline ||
      (stopWhenCovered && current.kind === "covered" && stable)
    ) {
      if (!stopWhenCovered && current.kind !== "unpositioned" && !stable)
        throw new Error(
          `Accessibility element ${target.id} did not settle after scrolling`,
        );
      const tag = current.kind === "covered" ? current.hitTag : null;
      throw new AccessibilityHitError(
        `Accessibility element ${target.id} is covered by ${tag ?? "another element"} or otherwise not hittable`,
      );
    }
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
