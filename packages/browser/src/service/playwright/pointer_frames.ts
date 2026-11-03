import { PlaywrightInputPreparation } from "./input_preparation";
import type { FrameScope } from "./frame_routing";
import type { ExecutionOptions } from "./execution_state";
import type { CdpTarget } from "../cdp/dispatch_helpers";
export interface PointerPoint {
  x: number;
  y: number;
}
export type PointerFrame = FrameScope["oopifFrameChain"][number];
export interface FrameBoundary {
  frame: PointerFrame;
  ownerBackendNodeId: number;
  point: PointerPoint;
}
/** Original b5/li/gp. */
export function pointInFrameQuad(
  point: PointerPoint,
  size: { width: number; height: number } | null | undefined,
  quad: number[] | null | undefined,
): PointerPoint | null {
  if (quad == null || quad.length < 8) return null;
  if (size != null) {
    const origin = { x: quad[0] ?? 0, y: quad[1] ?? 0 },
      horizontal = { x: quad[2] ?? 0, y: quad[3] ?? 0 },
      vertical = { x: quad[6] ?? 0, y: quad[7] ?? 0 },
      x = point.x / size.width,
      y = point.y / size.height;
    return {
      x: origin.x + x * (horizontal.x - origin.x) + y * (vertical.x - origin.x),
      y: origin.y + x * (horizontal.y - origin.y) + y * (vertical.y - origin.y),
    };
  }
  const xs = [quad[0], quad[2], quad[4], quad[6]].filter(
      (value) => value != null,
    ),
    ys = [quad[1], quad[3], quad[5], quad[7]].filter((value) => value != null);
  return xs.length !== 4 || ys.length !== 4
    ? null
    : { x: Math.min(...xs) + point.x, y: Math.min(...ys) + point.y };
}
/** Original xF: first matching attribute wins. */
export function nodeAttribute(attributes: string[], name: string) {
  for (let index = 0; index < attributes.length; index += 2)
    if (attributes[index] === name) return attributes[index + 1];
}
/** Original ig pointer frame geometry and obstruction checks. */
export class PlaywrightPointerFrames extends PlaywrightInputPreparation {
  async currentTopLevelPointForAction(
    point: PointerPoint,
    chain: PointerFrame[] | null | undefined,
    options: ExecutionOptions = {},
  ) {
    if (!chain?.length) return { frameBoundaries: [], point };
    let current = point;
    const frameBoundaries: FrameBoundary[] = [];
    for (const frame of chain.slice().reverse()) {
      const resolved = await this.currentPointInParentFrame(
        frame,
        current,
        options,
      );
      current = resolved.point;
      frameBoundaries.push({
        frame,
        ownerBackendNodeId: resolved.backendNodeId,
        point: current,
      });
    }
    return { frameBoundaries, point: current };
  }
  async currentPointInParentFrame(
    frame: PointerFrame,
    point: PointerPoint,
    options: ExecutionOptions = {},
  ) {
    if (frame.frameId == null)
      throw new Error("Cannot recompute OOPIF frame offset without a frame id");
    const { backendNodeId } = await this.callCdpTarget(
      frame.parentTarget,
      "DOM.getFrameOwner",
      { frameId: frame.frameId },
      options,
    );
    const quad = this.isIabBackend
      ? (
          await this.callCdpTarget(
            frame.parentTarget,
            "DOM.getBoxModel",
            { backendNodeId },
            options,
          )
        ).model.content
      : (
          await this.callCdpTarget(
            frame.parentTarget,
            "DOM.getContentQuads",
            { backendNodeId },
            options,
          )
        ).quads[0];
    const mapped = pointInFrameQuad(point, frame.size, quad);
    if (mapped == null)
      throw new Error("Frame owner does not have content quads");
    return { backendNodeId, point: mapped };
  }
  async obstructingFrameHitTarget(
    target: { frameBoundaries: FrameBoundary[] },
    options: ExecutionOptions = {},
  ) {
    for (const boundary of target.frameBoundaries.slice().reverse()) {
      const obstruction = await this.obstructingFrameBoundaryHitTarget(
        boundary,
        options,
      );
      if (obstruction != null) return obstruction;
    }
    return null;
  }
  async obstructingFrameBoundaryHitTarget(
    boundary: FrameBoundary,
    options: ExecutionOptions = {},
  ) {
    try {
      const hit = await this.callCdpTarget(
        boundary.frame.parentTarget,
        "DOM.getNodeForLocation",
        {
          x: Math.round(boundary.point.x),
          y: Math.round(boundary.point.y),
          includeUserAgentShadowDOM: true,
        },
        {
          timeoutMs: options.timeoutMs,
          telemetryAttrs: {
            "browser_use.playwright.operation":
              this.performanceSpan.currentPlaywrightOperation("locator"),
            "browser_use.playwright.phase": "hit_target_check",
          },
        },
      );
      return hit.backendNodeId === boundary.ownerBackendNodeId ||
        hit.frameId === boundary.frame.frameId
        ? null
        : await this.describeBackendNodeForHitTarget(
            boundary.frame.parentTarget,
            hit.backendNodeId,
            options,
          );
    } catch {
      return null;
    }
  }
  async describeBackendNodeForHitTarget(
    target: CdpTarget,
    backendNodeId: number,
    options: ExecutionOptions = {},
  ) {
    try {
      const { node } = await this.callCdpTarget(
          target,
          "DOM.describeNode",
          { backendNodeId },
          options,
        ),
        name = node.localName || node.nodeName?.toLowerCase() || "unknown",
        attributes = Array.isArray(node.attributes) ? node.attributes : [],
        id = nodeAttribute(attributes, "id"),
        classes = nodeAttribute(attributes, "class");
      return `<${name}${id ? `#${id}` : ""}${classes ? `.${classes.trim().split(/\s+/).slice(0, 3).join(".")}` : ""}>`;
    } catch {
      return "another element";
    }
  }
}
