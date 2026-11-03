/** Original Ore: map debugger-space bounds into the frame owner's DOM rectangle. */
export function hitTestFrameOwner(
  this: Element,
  argument: {
    bounds: { left: number; right: number; top: number; bottom: number };
    point: { x: number; y: number };
  },
) {
  const viewport = this.ownerDocument.defaultView;
  if (viewport == null) throw new Error("Frame owner has no window");
  const rect = this.getBoundingClientRect();
  const width = argument.bounds.right - argument.bounds.left,
    height = argument.bounds.bottom - argument.bounds.top;
  const point = {
    x:
      rect.left +
      ((argument.point.x - argument.bounds.left) / width) * rect.width,
    y:
      rect.top +
      ((argument.point.y - argument.bounds.top) / height) * rect.height,
  };
  const root = this.getRootNode();
  let hit =
    root instanceof ShadowRoot
      ? root.elementFromPoint(point.x, point.y)
      : this.ownerDocument.elementFromPoint(point.x, point.y);
  while (hit?.shadowRoot != null) {
    const child = hit.shadowRoot.elementFromPoint(point.x, point.y);
    if (child == null || child === hit) break;
    hit = child;
  }
  return {
    hitTag: hit?.tagName ?? null,
    hitsTarget: hit === this,
    viewportSize: { height: viewport.innerHeight, width: viewport.innerWidth },
  };
}
/** Original Mre: page-side hit testing, composed-tree ancestry and label fallback. */
export function hitTestElement(this: Node) {
  const element = this instanceof Element ? this : this.parentElement;
  if (element == null)
    throw new Error("Cannot hit-test a detached accessibility element");
  let rect = element.getClientRects()[0] ?? element.getBoundingClientRect();
  if (this instanceof Text) {
    const range = document.createRange();
    range.selectNode(this);
    rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  }
  const center = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  const viewport = element.ownerDocument.defaultView;
  if (viewport == null)
    throw new Error(
      "Cannot hit-test an accessibility element without a viewport",
    );
  const visual = viewport.visualViewport,
    offsetX = visual?.offsetLeft ?? 0,
    offsetY = visual?.offsetTop ?? 0;
  const left = Math.max(rect.left, offsetX),
    right = Math.min(
      rect.right,
      offsetX + (visual?.width ?? viewport.innerWidth),
    ),
    top = Math.max(rect.top, offsetY),
    bottom = Math.min(
      rect.bottom,
      offsetY + (visual?.height ?? viewport.innerHeight),
    );
  const point =
    right > left && bottom > top
      ? { x: (left + right) / 2, y: (top + bottom) / 2 }
      : center;
  const control =
    element instanceof HTMLInputElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? element
      : undefined;
  const candidates = [element, ...Array.from(control?.labels ?? [])];
  const interactive = [
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    '[role="button"]',
    '[role="checkbox"]',
    '[role="combobox"]',
    '[role="link"]',
    '[role="listbox"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="radio"]',
    '[role="slider"]',
    '[role="spinbutton"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="textbox"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  const deepestHit = (
    candidate: Element,
    x = point.x,
    y = point.y,
  ): Element | null => {
    const root = candidate.getRootNode();
    let hit =
      root instanceof ShadowRoot
        ? root.elementFromPoint(x, y)
        : candidate.ownerDocument.elementFromPoint(x, y);
    while (hit?.shadowRoot != null) {
      const child = hit.shadowRoot.elementFromPoint(x, y);
      if (child == null || child === hit) break;
      hit = child;
    }
    return hit;
  };
  const composedContains = (
    ancestor: Node,
    descendant: Node,
    requireCrossing = false,
  ): boolean => {
    let crossed = false;
    for (let node: Node | null = descendant; node != null;) {
      if (node === ancestor) return !requireCrossing || crossed;
      const slot: HTMLSlotElement | null =
        node instanceof Element || node instanceof Text
          ? node.assignedSlot
          : null;
      if (slot != null) {
        crossed = true;
        node = slot;
      } else if (node.parentNode != null) node = node.parentNode;
      else {
        const root: Node = node.getRootNode();
        const host: Element | null =
          root instanceof ShadowRoot ? root.host : null;
        crossed ||= host != null;
        node = host;
      }
    }
    return false;
  };
  const hits = (candidate: Element, x = point.x, y = point.y): boolean => {
    const hit = deepestHit(candidate, x, y);
    if (hit == null) return false;
    const hitControl = hit.closest(interactive),
      candidateControl =
        (candidate instanceof HTMLLabelElement ? candidate.control : null) ??
        candidate.closest(interactive);
    if (
      candidateControl != null &&
      hitControl != null &&
      hitControl !== candidateControl &&
      !composedContains(hitControl, candidateControl)
    )
      return false;
    if (
      composedContains(candidate, hit) ||
      composedContains(hit, candidate, true)
    )
      return true;
    const labelControl = candidate.closest("label")?.control;
    if (
      (labelControl != null &&
        (composedContains(hit, labelControl) ||
          composedContains(labelControl, hit) ||
          (candidate === element &&
            hit.parentElement === labelControl.parentElement &&
            (hitControl == null ||
              composedContains(hitControl, labelControl))))) ||
      (candidateControl != null && candidateControl === hitControl)
    )
      return true;
    return (
      getComputedStyle(candidate).pointerEvents === "none" &&
      composedContains(hit, candidate)
    );
  };
  const hitsTarget = candidates.some((candidate) => hits(candidate));
  return {
    fallbackPoint:
      (hitsTarget
        ? null
        : candidates
            .slice(1)
            .flatMap((candidate) =>
              Array.from(candidate.getClientRects()).map((rect) => ({
                candidate,
                point: {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                },
                size: { height: rect.height, width: rect.width },
              })),
            )
            .find(
              ({ candidate, point, size }) =>
                size.width > 1 &&
                size.height > 1 &&
                hits(candidate, point.x, point.y),
            )?.point) ?? null,
    hitTag: deepestHit(element)?.tagName ?? null,
    hitsTarget,
    point,
    viewportSize: { height: viewport.innerHeight, width: viewport.innerWidth },
  };
}
