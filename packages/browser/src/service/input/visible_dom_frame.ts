import { domState, type Clip, type DomFrame } from "./dom_state";
export interface VisibleFrameElement {
  ref: string;
  rect: Clip;
  size?: { width: number; height: number };
  url?: string;
}
export interface VisibleDomCapture {
  frameElements: VisibleFrameElement[];
  items: { ref: string; line: string }[];
  viewport: Clip;
}
/** Original wY/bY/gY/yY/hY. Preserve permissive viewport and rectangle ordering checks. */
export function isVisibleDomRect(value: any): value is Clip {
  return (
    value != null &&
    typeof value === "object" &&
    ["bottom", "left", "right", "top"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    )
  );
}
export function isVisibleDomSize(
  value: any,
): value is { width: number; height: number } {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    value.height > 0 &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width > 0
  );
}
export function isVisibleFrameElement(
  value: any,
): value is VisibleFrameElement {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.ref === "string" &&
    isVisibleDomRect(value.rect) &&
    (value.size == null || isVisibleDomSize(value.size)) &&
    (value.url == null || typeof value.url === "string")
  );
}
export function isVisibleDomItem(
  value: any,
): value is { ref: string; line: string } {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.ref === "string" &&
    typeof value.line === "string"
  );
}
export function parseVisibleDomCapture(value: any): VisibleDomCapture | null {
  if (value == null || typeof value !== "object") return null;
  if (!Array.isArray(value.items) || value.viewport == null) return null;
  return {
    frameElements: Array.isArray(value.frameElements)
      ? value.frameElements.filter(isVisibleFrameElement)
      : [],
    items: value.items.filter(isVisibleDomItem),
    viewport: value.viewport,
  };
}
/** Original H_/W_/fY. */
export function childFrameTimeout(deadline: number) {
  return Math.max(1, Math.min(500, deadline - Date.now()));
}
export function remainingDomTimeout(deadline?: number) {
  return deadline == null ? undefined : Math.max(1, deadline - Date.now());
}
export function mainFrameKey(frame: { id: string; loaderId?: string }) {
  return `${frame.id}:${frame.loaderId ?? ""}`;
}
/** Original mY; reviewer and ordinary page reference stores remain separate. */
export function frameElementExpression(ref: string, reviewer: boolean) {
  return `(() => {\n    const __name = (target) => target;\n    const state = globalThis.${reviewer ? "__browserUseReviewerVisibleDomState" : "__browserUseVisibleDomState"};\n    return state?.refToElement?.get(${JSON.stringify(ref)}) ?? null;\n  })()`;
}
/** Original AD. */
export function visibleDomException(details: any) {
  const exception = details.exception;
  return typeof exception?.value === "string"
    ? exception.value
    : (exception?.description ?? details.text ?? "Visible DOM evaluation failed");
}
type Cdp = Parameters<typeof domState.evaluate>[0];
type CaptureExpression = (
  maxChars: number,
  maxElements: number,
  clip: Clip | undefined,
  reviewer: boolean,
) => string;
/** Original dY/CD/pY. cY page renderer is explicit until the complete renderer is restored. */
export function createVisibleDomFrameReader(
  expression: CaptureExpression,
  state = domState,
) {
  async function capture(
    cdp: Cdp,
    frame: DomFrame,
    maxChars: number,
    maxElements: number,
    clip: Clip | undefined,
    reviewer: boolean,
    timeout?: number,
  ) {
    const result = await state.evaluate(
      cdp,
      frame.target,
      frame.frameId,
      frame.loaderId,
      expression(maxChars, maxElements, clip, reviewer),
      { returnByValue: true, timeoutMs: timeout },
    );
    if (result.exceptionDetails != null)
      throw new Error(visibleDomException(result.exceptionDetails));
    return parseVisibleDomCapture(result.result.value);
  }
  async function frameId(
    cdp: Cdp,
    frame: DomFrame,
    ref: string,
    timeout: number | undefined,
    reviewer: boolean,
  ) {
    const result = await state.evaluate(
      cdp,
      frame.target,
      frame.frameId,
      frame.loaderId,
      frameElementExpression(ref, reviewer),
      { returnByValue: false, timeoutMs: timeout },
    );
    if (result.exceptionDetails != null)
      throw new Error(visibleDomException(result.exceptionDetails));
    const objectId = result.result.objectId;
    if (typeof objectId !== "string") return null;
    try {
      const { node } = await cdp.callTarget(
        frame.target,
        "DOM.describeNode",
        { objectId },
        { timeoutMs: timeout },
      );
      return typeof node.frameId === "string" ? node.frameId : null;
    } finally {
      await cdp
        .callTarget(
          frame.target,
          "Runtime.releaseObject",
          { objectId },
          { timeoutMs: timeout },
        )
        .catch(() => {});
    }
  }
  async function findFrame(
    cdp: Cdp,
    frame: DomFrame,
    children: VisibleFrameElement[],
    wanted: string,
    deadline: number | undefined,
    reviewer: boolean,
  ) {
    for (const child of children) {
      if (deadline != null && Date.now() >= deadline) break;
      if (
        (await frameId(
          cdp,
          frame,
          child.ref,
          remainingDomTimeout(deadline) ?? 500,
          reviewer,
        ).catch(() => null)) === wanted
      )
        return child;
    }
  }
  return { capture, frameId, findFrame };
}
