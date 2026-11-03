import { isNestedTarget, type CdpTarget } from "../cdp/dispatch_helpers";
interface Cdp {
  callTarget(...args: any[]): Promise<any>;
  targetForFrameOrAttach(...args: any[]): Promise<any>;
}
interface Point {
  x: number;
  y: number;
}
export async function inputGuardWorld(
  cdp: Cdp,
  target: CdpTarget,
  options: any,
) {
  const { frameTree } = await cdp.callTarget(
    target,
    "Page.getFrameTree",
    undefined,
    options,
  );
  return await cdp.callTarget(
    target,
    "Page.createIsolatedWorld",
    {
      frameId: frameTree.frame.id,
      grantUniveralAccess: false,
      worldName: "browser-use-input-guard",
    },
    options,
  );
}
export function focusedElement(this: any) {
  let element = this.activeElement;
  while (element?.shadowRoot?.activeElement != null)
    element = element.shadowRoot.activeElement;
  return element;
}
async function releaseObject(
  cdp: Cdp,
  target: CdpTarget,
  objectId: string | undefined,
  options: any,
) {
  if (objectId != null)
    await cdp
      .callTarget(target, "Runtime.releaseObject", { objectId }, options)
      .catch(() => {});
}
async function inspectFocus(
  cdp: Cdp,
  target: CdpTarget,
  options: any,
  rootId?: number,
) {
  const { executionContextId } = await inputGuardWorld(cdp, target, options);
  let rootObject;
  try {
    if (rootId != null) {
      const { object } = await cdp.callTarget(
        target,
        "DOM.resolveNode",
        { backendNodeId: rootId, executionContextId },
        options,
      );
      rootObject = object.objectId;
      if (rootObject == null)
        throw new Error("Keyboard focus root is no longer available");
    }
    const result =
      rootObject == null
        ? await cdp.callTarget(
            target,
            "Runtime.evaluate",
            {
              expression: `(${focusedElement.toString()}).call(document)`,
              contextId: executionContextId,
              returnByValue: false,
            },
            options,
          )
        : await cdp.callTarget(
            target,
            "Runtime.callFunctionOn",
            {
              objectId: rootObject,
              functionDeclaration: focusedElement.toString(),
              returnByValue: false,
            },
            options,
          );
    if (result.exceptionDetails != null)
      throw new Error("Could not inspect keyboard focus");
    return result.result;
  } finally {
    await releaseObject(cdp, target, rootObject, options);
  }
}
/** Original Vy/jA/HA/Gy/ml: inspect focused content across documents and targets. */
export async function assertFocusedInput(
  cdp: Cdp,
  tabId: number,
  options: any,
) {
  let target: CdpTarget = { tabId },
    rootId: number | undefined;
  for (;;) {
    const focused = await inspectFocus(cdp, target, options, rootId);
    if (focused.subtype === "null") return;
    const objectId = focused.objectId;
    if (objectId == null) throw new Error("Could not inspect keyboard focus");
    const owner = target;
    try {
      const { node } = await cdp.callTarget(
          target,
          "DOM.describeNode",
          { objectId, depth: 0 },
          options,
        ),
        closed = node.shadowRoots?.find(
          (root: any) => root.shadowRootType === "closed",
        );
      if (closed != null) {
        const inside = await inspectFocus(
          cdp,
          target,
          options,
          closed.backendNodeId,
        );
        await releaseObject(cdp, target, inside.objectId, options);
        if (inside.subtype !== "null")
          throw new Error("Cannot send keys into a closed shadow root");
      }
      if (node.localName !== "iframe" && node.localName !== "frame") return;
      if (node.contentDocument != null)
        rootId = node.contentDocument.backendNodeId;
      else {
        if (node.frameId == null)
          throw new Error("Focused iframe is no longer available");
        const child = await cdp.targetForFrameOrAttach(
          tabId,
          node.frameId,
          options,
          { parentTarget: target },
        );
        if (child == null)
          throw new Error("Could not inspect the focused iframe");
        target = child;
        rootId = undefined;
      }
    } finally {
      await releaseObject(cdp, owner, objectId, options);
    }
  }
}
export function elementRoot(this: any) {
  const element = "getRootNode" in this ? this : this.element;
  if (!element.isConnected) throw new Error("Click target is detached");
  return element.getRootNode();
}
export function hostRoot(this: any) {
  return this.host.getRootNode();
}
export async function assertOpenRoots(
  cdp: Cdp,
  target: CdpTarget,
  nodeId: number,
  options: any = {},
) {
  const { executionContextId } = await inputGuardWorld(cdp, target, options),
    { object } = await cdp.callTarget(
      target,
      "DOM.resolveNode",
      { backendNodeId: nodeId, executionContextId },
      options,
    ),
    objectId = object.objectId;
  if (objectId == null) throw new Error("Click target is no longer available");
  const objects = [objectId];
  async function rootOf(id: string, fn: Function) {
    const result = await cdp.callTarget(
        target,
        "Runtime.callFunctionOn",
        { objectId: id, functionDeclaration: fn.toString() },
        options,
      ),
      rootId = result.result.objectId;
    if (rootId != null) objects.push(rootId);
    if (result.exceptionDetails != null || rootId == null)
      throw new Error("Could not check the click target's shadow root");
    const { node } = await cdp.callTarget(
      target,
      "DOM.describeNode",
      { objectId: rootId, depth: 0 },
      options,
    );
    return { objectId: rootId, node };
  }
  try {
    let root = await rootOf(objectId, elementRoot);
    while (root.node.shadowRootType !== undefined)
      switch (root.node.shadowRootType) {
        case "closed":
          throw new Error("Cannot click content inside a closed shadow root");
        case "open":
        case "user-agent":
          root = await rootOf(root.objectId, hostRoot);
          break;
      }
  } finally {
    await Promise.all(
      objects.map((id) =>
        cdp
          .callTarget(
            target,
            "Runtime.releaseObject",
            { objectId: id },
            options,
          )
          .catch(() => {}),
      ),
    );
  }
}
export function framePath(tree: any, frameId: string): string[] | undefined {
  if (tree.frame.id === frameId) return [];
  for (const child of tree.childFrames ?? []) {
    const path = framePath(child, frameId);
    if (path != null) return [child.frame.id, ...path];
  }
}
export function iframeInputPoint(
  point: Point,
  quad: number[],
  size: { width: number; height: number },
) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = quad;
  if (
    x0 == null ||
    y0 == null ||
    x1 == null ||
    y1 == null ||
    x2 == null ||
    y2 == null ||
    x3 == null ||
    y3 == null
  )
    throw new Error("Missing click target iframe geometry");
  const ax = x1 - x0,
    ay = y1 - y0,
    bx = x3 - x0,
    by = y3 - y0,
    det = ax * by - ay * bx;
  if (
    Math.abs(det) < 0.001 ||
    Math.abs(x2 - x1 - x3 + x0) > 0.01 ||
    Math.abs(y2 - y1 - y3 + y0) > 0.01
  )
    throw new Error("Unsupported click target iframe transform");
  const mapped = {
    x: (((point.x - x0) * by - (point.y - y0) * bx) * size.width) / det,
    y: ((ax * (point.y - y0) - ay * (point.x - x0)) * size.height) / det,
  };
  if (!Number.isInteger(mapped.x) || !Number.isInteger(mapped.y))
    throw new Error(
      "Cannot safely inspect fractional iframe input coordinates",
    );
  return mapped;
}
async function inspectPoint(
  cdp: Cdp,
  target: CdpTarget,
  point: Point,
  options: any,
  stopFrame?: string,
): Promise<string[]> {
  const [{ cssVisualViewport: viewport }, { frameTree }] = await Promise.all([
    cdp.callTarget(target, "Page.getLayoutMetrics", undefined, options),
    cdp.callTarget(target, "Page.getFrameTree", undefined, options),
  ]);
  const { backendNodeId, frameId } = await cdp.callTarget(
    target,
    "DOM.getNodeForLocation",
    {
      x: Math.round(point.x + viewport.pageX),
      y: Math.round(point.y + viewport.pageY),
    },
    options,
  );
  await assertOpenRoots(cdp, target, backendNodeId, options);
  const path = framePath(frameTree, frameId);
  if (path == null)
    throw new Error("Click target frame is no longer available");
  for (const frame of path) {
    const owner = await cdp.callTarget(
      target,
      "DOM.getFrameOwner",
      { frameId: frame },
      options,
    );
    await assertOpenRoots(cdp, target, owner.backendNodeId, options);
  }
  const { node } = await cdp.callTarget(
    target,
    "DOM.describeNode",
    { backendNodeId, depth: 0 },
    options,
  );
  if (
    (node.localName !== "iframe" && node.localName !== "frame") ||
    node.contentDocument != null
  )
    return [frameTree.frame.id];
  const child = await cdp.targetForFrameOrAttach(
    target.tabId,
    node.frameId ?? null,
    options,
    { parentTarget: target },
  );
  if (child == null || node.frameId == null)
    throw new Error("Could not inspect the click target iframe");
  const [{ model }, { executionContextId }, { frameTree: childTree }] =
    await Promise.all([
      cdp.callTarget(target, "DOM.getBoxModel", { backendNodeId }, options),
      inputGuardWorld(cdp, child, options),
      cdp.callTarget(child, "Page.getFrameTree", undefined, options),
    ]);
  if (
    childTree.frame.id !== node.frameId ||
    childTree.frame.parentId !== frameId
  )
    throw new Error("Click target iframe changed during inspection");
  if (childTree.frame.id === stopFrame)
    return [frameTree.frame.id, childTree.frame.id];
  const result = await cdp.callTarget(
      child,
      "Runtime.evaluate",
      {
        contextId: executionContextId,
        expression: "({width: innerWidth, height: innerHeight})",
        returnByValue: true,
      },
      options,
    ),
    size = result.result.value;
  if (
    result.exceptionDetails != null ||
    size == null ||
    typeof size.width !== "number" ||
    typeof size.height !== "number"
  )
    throw new Error("Could not inspect the click target iframe viewport");
  const mapped = iframeInputPoint(point, model.content, size);
  return [
    frameTree.frame.id,
    ...(await inspectPoint(cdp, child, mapped, options, stopFrame)),
  ];
}
/** Original ru/Nv/Oc/pre/mre/fre/U2. */
export async function assertInputPoint(
  cdp: Cdp,
  target: CdpTarget,
  point: Point,
  options: any,
  topLevelPoint?: Point,
) {
  if (isNestedTarget(target)) {
    if (topLevelPoint == null)
      throw new Error("Missing top-level coordinates for the click target");
    const { frameTree } = await cdp.callTarget(
      target,
      "Page.getFrameTree",
      undefined,
      options,
    );
    if (
      !(
        await inspectPoint(
          cdp,
          { tabId: target.tabId },
          topLevelPoint,
          options,
          frameTree.frame.id,
        )
      ).includes(frameTree.frame.id)
    )
      throw new Error("Click target is not on the checked iframe path");
  }
  await inspectPoint(cdp, target, point, options);
}
