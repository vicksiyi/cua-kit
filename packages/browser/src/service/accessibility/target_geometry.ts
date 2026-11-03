import { framePoint, quadBounds } from "../input/dom_state";
import type { DomFrame } from "../input/dom_state";
import { callElementFunction } from "./element_execution";
import type {
  AccessibilityExecutionContext,
  AccessibilityTarget,
} from "./element_execution";
import { hitTestElement, hitTestFrameOwner } from "./hit_test";
export interface AccessibilityFrame extends DomFrame {
  ownerBackendNodeId?: number;
}
export interface GeometryTarget extends AccessibilityTarget {
  frameId: string;
}
export interface GeometryContext extends AccessibilityExecutionContext {
  isIabBackend: boolean;
  ax: {
    frameForId(tabId: number, frameId: string): AccessibilityFrame | undefined;
  };
}
/** Original Wv: preserve distinct input-target and top-level coordinates across same/remote targets. */
export async function inspectTargetGeometry(
  context: GeometryContext,
  tabId: number,
  target: GeometryTarget,
) {
  const { quads } = await context.cdp.callTarget(
    target.target,
    "DOM.getContentQuads",
    { backendNodeId: target.backendNodeId },
  );
  const bounds = quadBounds(quads[0]);
  if (bounds == null) return { kind: "unpositioned" as const };
  const hit = await callElementFunction(
    context,
    target,
    hitTestElement,
    undefined,
  );
  let inputPoint = hit.point;
  let covered: { hitTag: string | null } | undefined;
  if (!hit.hitsTarget) {
    if (hit.fallbackPoint == null) covered = { hitTag: hit.hitTag };
    else inputPoint = hit.fallbackPoint;
  }
  let point = inputPoint,
    viewport = hit.viewportSize;
  let frame = context.ax.frameForId(tabId, target.frameId);
  if (frame == null)
    throw new Error(`Accessibility frame ${target.frameId} is unavailable`);
  while (frame.parentFrameId != null) {
    const parent = context.ax.frameForId(tabId, frame.parentFrameId);
    if (parent == null)
      throw new Error(
        `Accessibility frame ${frame.parentFrameId} is unavailable`,
      );
    const remote =
      frame.target.sessionId !== parent.target.sessionId ||
      frame.target.targetId !== parent.target.targetId;
    const owner = frame.ownerBackendNodeId;
    if (owner == null)
      throw new Error(`Accessibility frame ${frame.frameId} has no owner`);
    const model = context.isIabBackend
      ? (
          await context.cdp.callTarget(parent.target, "DOM.getBoxModel", {
            backendNodeId: owner,
          })
        ).model
      : undefined;
    const quad =
      model?.border ??
      (
        await context.cdp.callTarget(parent.target, "DOM.getContentQuads", {
          backendNodeId: owner,
        })
      ).quads[0];
    const ownerBounds = quadBounds(quad);
    if (ownerBounds == null)
      throw new Error(
        `Accessibility frame ${frame.frameId} has no content bounds`,
      );
    if (!remote && frame.frameId === target.frameId) {
      const contentModel =
        model ??
        (
          await context.cdp.callTarget(parent.target, "DOM.getBoxModel", {
            backendNodeId: owner,
          })
        ).model;
      const mapped = framePoint(point, hit.viewportSize, contentModel.content);
      if (mapped == null)
        throw new Error(
          `Accessibility frame ${frame.frameId} has no content bounds`,
        );
      inputPoint = mapped;
      point = mapped;
    }
    if (remote) {
      const mapped = framePoint(
        point,
        context.isIabBackend ? viewport : frame.size,
        model?.content ?? quad,
      );
      if (mapped == null)
        throw new Error(
          `Accessibility frame ${frame.frameId} has no content bounds`,
        );
      point = mapped;
    }
    const ownerTarget = {
      actionDescriptions: [],
      backendNodeId: owner,
      frameId: parent.frameId,
      id: target.id,
      target: parent.target,
    };
    const ownerHit = await callElementFunction(
      context,
      ownerTarget,
      hitTestFrameOwner,
      { bounds: ownerBounds, point },
    );
    if (!ownerHit.hitsTarget) covered ??= { hitTag: ownerHit.hitTag };
    viewport = ownerHit.viewportSize;
    frame = parent;
  }
  const geometry = {
    height: bounds.bottom - bounds.top,
    inputPoint,
    point,
    target: target.target,
    width: bounds.right - bounds.left,
  };
  return covered == null
    ? { kind: "hittable" as const, point: geometry }
    : { kind: "covered" as const, hitTag: covered.hitTag, point: geometry };
}
