import { domState, type Clip } from "./dom_state";
/** Original eoe executes inside the isolated DOM world. */
export function visibleNodePoint(localRef: string, clip: Clip) {
  const element = (
    globalThis as any
  ).__browserUseVisibleDomState?.refToElement.get(localRef);
  if (!element?.isConnected) return null;
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  const center = (rect: DOMRect) => {
    if (rect.width <= 0 || rect.height <= 0) return null;
    const left = Math.max(rect.left, clip.left),
      right = Math.min(rect.right, clip.right),
      top = Math.max(rect.top, clip.top),
      bottom = Math.min(rect.bottom, clip.bottom);
    return right > left && bottom > top
      ? { x: left + (right - left) / 2, y: top + (bottom - top) / 2 }
      : null;
  };
  for (const rect of element.getClientRects()) {
    const point = center(rect);
    if (point != null) return point;
  }
  return center(element.getBoundingClientRect());
}
export function nodePointExpression(localRef: string, clip: Clip) {
  return `(() => {\n    const __name = (target) => target;\n    return (${visibleNodePoint.toString()})(${JSON.stringify(localRef)}, ${JSON.stringify(clip)});\n  })()`;
}
export function pointValue(value: any) {
  if (value == null || typeof value !== "object") return null;
  return typeof value.x === "number" && typeof value.y === "number"
    ? { x: value.x, y: value.y }
    : null;
}
export function domExceptionMessage(details: any) {
  const exception = details.exception;
  return typeof exception?.value === "string"
    ? exception.value
    : (exception?.description ?? details.text ?? "DOM node failed");
}
/** Original cS/Qne/toe/roe assembled over the restored shared DOM state. */
export function createDomNodeResolver(state = domState) {
  return async function resolveDomNode(
    tabId: number,
    cdp: Parameters<typeof state.evaluate>[0],
    publicId: string,
    inspectViewport = false,
  ) {
    const node = state.resolveNode(tabId, publicId);
    const result = await state.evaluate(
      cdp,
      node.target,
      node.frameId,
      node.loaderId,
      nodePointExpression(node.localRef, node.viewportClip),
      { returnByValue: true },
    );
    if (result.exceptionDetails != null)
      throw new Error(domExceptionMessage(result.exceptionDetails));
    const point = pointValue(result.result.value);
    if (point == null)
      throw new Error(`DOM node ${publicId} is stale or missing`);
    return {
      inputPoint: await state.inputPoint(
        tabId,
        cdp,
        node.frameId,
        point,
        inspectViewport,
      ),
      point: await state.topLevelPoint(
        tabId,
        cdp,
        node.frameId,
        point,
        inspectViewport,
      ),
      target: node.target,
    };
  };
}
export const resolveDomNode = createDomNodeResolver();
