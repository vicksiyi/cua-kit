import type { CdpTarget } from "../cdp/dispatch_helpers";
interface Point {
  x: number;
  y: number;
}
interface Size {
  width: number;
  height: number;
}
export interface Clip {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
export interface DomFrame {
  frameId: string;
  loaderId?: string;
  target: CdpTarget;
  parentFrameId?: string;
  size?: Size;
}
interface NodeReference {
  frameId: string;
  loaderId?: string;
  localRef: string;
  target: CdpTarget;
  viewportClip: Clip;
}
interface State {
  framesById: Map<string, DomFrame>;
  mainFrameKey: string;
  nextPublicId: number;
  nodeByPublicId: Map<string, NodeReference>;
  publicIdByFrameLocalRef: Map<string, string>;
}
interface Cdp {
  callTarget(...args: any[]): Promise<any>;
  addTabCleanupHandler(handler: (tabId: number) => void): unknown;
}
function targetKey(target: CdpTarget) {
  return `${target.tabId}:${target.sessionId ?? ""}:${target.targetId ?? ""}`;
}
function contextKey(target: CdpTarget, frameId: string, loaderId?: string) {
  return `${targetKey(target)}:${frameId}:${loaderId ?? ""}`;
}
function sameTarget(a: CdpTarget, b: CdpTarget) {
  return targetKey(a) === targetKey(b);
}
export function quadBounds(quad?: number[] | null): Clip | null {
  if (quad == null || quad.length < 8) return null;
  const xs = [quad[0], quad[2], quad[4], quad[6]].filter(
      (value) => value != null,
    ),
    ys = [quad[1], quad[3], quad[5], quad[7]].filter((value) => value != null);
  return xs.length !== 4 || ys.length !== 4
    ? null
    : {
        bottom: Math.max(...ys),
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
      };
}
export function framePoint(
  point: Point,
  size: Size | undefined,
  quad?: number[] | null,
) {
  if (quad == null || quad.length < 8) return null;
  if (size != null) {
    const a = { x: quad[0] ?? 0, y: quad[1] ?? 0 },
      b = { x: quad[2] ?? 0, y: quad[3] ?? 0 },
      d = { x: quad[6] ?? 0, y: quad[7] ?? 0 },
      x = point.x / size.width,
      y = point.y / size.height;
    return {
      x: a.x + x * (b.x - a.x) + y * (d.x - a.x),
      y: a.y + x * (b.y - a.y) + y * (d.y - a.y),
    };
  }
  const bounds = quadBounds(quad);
  return bounds == null
    ? null
    : { x: bounds.left + point.x, y: bounds.top + point.y };
}
export function intersectClips(a: Clip, b: Clip) {
  const clip = {
    bottom: Math.min(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.max(a.top, b.top),
  };
  return clip.right > clip.left && clip.bottom > clip.top ? clip : null;
}
export function relativeClip(a: Clip, b: Clip) {
  const clip = intersectClips(a, b);
  return clip == null
    ? null
    : {
        bottom: clip.bottom - a.top,
        left: clip.left - a.left,
        right: clip.right - a.left,
        top: clip.top - a.top,
      };
}
/** Original yo/bo/sD and lD/cD/dD/pD/mD/va/fD/hD/gD/aD/uD/rY/bD/F_/yD/nY. */
export function createDomState() {
  const tabs = new Map<number, State>(),
    contexts = new Map<string, { executionContextId: number }>(),
    bound = new WeakSet<Cdp>();
  function bind(cdp: Cdp) {
    if (!bound.has(cdp)) {
      bound.add(cdp);
      cdp.addTabCleanupHandler((tabId) => {
        tabs.delete(tabId);
        for (const key of contexts.keys())
          if (key.startsWith(`${tabId}:`)) contexts.delete(key);
      });
    }
  }
  function beginSnapshot(tabId: number, mainFrameKey: string) {
    const previous = tabs.get(tabId),
      state =
        previous?.mainFrameKey === mainFrameKey
          ? previous
          : {
              framesById: new Map(),
              mainFrameKey,
              nextPublicId: 1,
              nodeByPublicId: new Map(),
              publicIdByFrameLocalRef: new Map(),
            };
    state.framesById.clear();
    state.nodeByPublicId.clear();
    if (state.publicIdByFrameLocalRef.size > 5000) {
      state.publicIdByFrameLocalRef.clear();
      state.nextPublicId = 1;
    }
    tabs.set(tabId, state);
  }
  function registerFrame(tabId: number, frame: DomFrame) {
    tabs.get(tabId)?.framesById.set(frame.frameId, frame);
  }
  function registerNode(
    tabId: number,
    frame: DomFrame,
    localRef: string,
    viewportClip: Clip,
  ) {
    const state = tabs.get(tabId);
    if (state == null) throw new Error("DOM CUA snapshot state is missing");
    const key = `${frame.frameId}:${frame.loaderId ?? ""}:${localRef}`;
    let publicId = state.publicIdByFrameLocalRef.get(key);
    if (publicId == null) {
      publicId = String(state.nextPublicId++);
      state.publicIdByFrameLocalRef.set(key, publicId);
    }
    state.nodeByPublicId.set(publicId, {
      frameId: frame.frameId,
      loaderId: frame.loaderId,
      localRef,
      target: frame.target,
      viewportClip,
    });
    return publicId;
  }
  function resolveNode(tabId: number, publicId: string) {
    const node = tabs.get(tabId)?.nodeByPublicId.get(publicId);
    if (node == null)
      throw new Error(`DOM node ${publicId} is stale or missing`);
    return node;
  }
  async function isolatedContext(
    cdp: Cdp,
    target: CdpTarget,
    frameId: string,
    loaderId: string | undefined,
    timeoutMs?: number,
  ) {
    const key = contextKey(target, frameId, loaderId),
      existing = contexts.get(key);
    if (existing != null) return existing;
    const context = {
      executionContextId: (
        await cdp.callTarget(
          target,
          "Page.createIsolatedWorld",
          {
            frameId,
            grantUniveralAccess: false,
            worldName: "browser-use-dom-cua",
          },
          { timeoutMs },
        )
      ).executionContextId,
    };
    contexts.set(key, context);
    if (contexts.size > 50) {
      const oldest = contexts.keys().next().value;
      if (oldest != null) contexts.delete(oldest);
    }
    return context;
  }
  async function evaluateIn(
    cdp: Cdp,
    target: CdpTarget,
    context: { executionContextId: number },
    expression: string,
    options: any,
  ) {
    return await cdp.callTarget(
      target,
      "Runtime.evaluate",
      {
        awaitPromise: true,
        contextId: context.executionContextId,
        expression,
        returnByValue: options.returnByValue,
        timeout: options.timeoutMs,
      },
      { timeoutMs: options.timeoutMs },
    );
  }
  async function evaluate(
    cdp: Cdp,
    target: CdpTarget,
    frameId: string,
    loaderId: string | undefined,
    expression: string,
    options: any,
  ) {
    let context = await isolatedContext(
      cdp,
      target,
      frameId,
      loaderId,
      options.timeoutMs,
    );
    try {
      return await evaluateIn(cdp, target, context, expression, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/Cannot find context|Execution context was destroyed|context.*destroyed|context.*not found/i.test(
          message,
        )
      )
        throw error;
      contexts.delete(contextKey(target, frameId, loaderId));
      context = await isolatedContext(
        cdp,
        target,
        frameId,
        loaderId,
        options.timeoutMs,
      );
      return await evaluateIn(cdp, target, context, expression, options);
    }
  }
  async function transform(
    cdp: Cdp,
    parent: CdpTarget,
    frame: DomFrame,
    point: Point,
    inspectViewport: boolean,
  ) {
    const { backendNodeId } = await cdp.callTarget(
      parent,
      "DOM.getFrameOwner",
      { frameId: frame.frameId },
    );
    let size = frame.size,
      quad;
    if (inspectViewport) {
      const [{ model }, viewport] = await Promise.all([
        cdp.callTarget(parent, "DOM.getBoxModel", { backendNodeId }),
        evaluate(
          cdp,
          frame.target,
          frame.frameId,
          frame.loaderId,
          "({width: innerWidth, height: innerHeight})",
          { returnByValue: true },
        ),
      ]);
      size = viewport.result.value;
      if (
        viewport.exceptionDetails != null ||
        size == null ||
        !Number.isFinite(size.width) ||
        !Number.isFinite(size.height)
      )
        throw new Error("Could not inspect the DOM CUA frame viewport");
      quad = model.content;
    } else {
      const { quads } = await cdp.callTarget(parent, "DOM.getContentQuads", {
        backendNodeId,
      });
      quad = quads[0];
    }
    const mapped = framePoint(point, size, quad);
    if (mapped == null)
      throw new Error(
        `Missing frame geometry for DOM CUA frame ${frame.frameId}`,
      );
    return mapped;
  }
  async function topLevelPoint(
    tabId: number,
    cdp: Cdp,
    frameId: string,
    point: Point,
    inspectViewport = false,
  ) {
    const state = tabs.get(tabId);
    if (state == null) throw new Error(`Missing DOM CUA frame ${frameId}`);
    let frame = state.framesById.get(frameId);
    if (frame == null) throw new Error(`Missing DOM CUA frame ${frameId}`);
    let mapped = point;
    while (frame?.parentFrameId != null) {
      const parent = state.framesById.get(frame.parentFrameId);
      if (parent == null)
        throw new Error(`Missing parent DOM CUA frame ${frame.frameId}`);
      mapped = await transform(
        cdp,
        parent.target,
        frame,
        mapped,
        inspectViewport,
      );
      frame = parent;
      while (frame.parentFrameId != null) {
        const ancestor = state.framesById.get(frame.parentFrameId);
        if (ancestor == null)
          throw new Error(`Missing parent DOM CUA frame ${frame.frameId}`);
        if (!sameTarget(frame.target, ancestor.target)) break;
        frame = ancestor;
      }
    }
    return mapped;
  }
  async function inputPoint(
    tabId: number,
    cdp: Cdp,
    frameId: string,
    point: Point,
    inspectViewport = false,
  ) {
    const state = tabs.get(tabId);
    if (state == null) throw new Error(`Missing DOM CUA frame ${frameId}`);
    let frame = state.framesById.get(frameId);
    if (frame == null) throw new Error(`Missing DOM CUA frame ${frameId}`);
    let mapped = point;
    while (frame.parentFrameId != null) {
      const parent = state.framesById.get(frame.parentFrameId);
      if (parent == null)
        throw new Error(`Missing parent DOM CUA frame ${frame.frameId}`);
      if (!sameTarget(frame.target, parent.target)) break;
      mapped = await transform(
        cdp,
        parent.target,
        frame,
        mapped,
        inspectViewport,
      );
      frame = parent;
    }
    return mapped;
  }
  return {
    bind,
    beginSnapshot,
    registerFrame,
    registerNode,
    resolveNode,
    evaluate,
    topLevelPoint,
    inputPoint,
  };
}
export const domState = createDomState();
