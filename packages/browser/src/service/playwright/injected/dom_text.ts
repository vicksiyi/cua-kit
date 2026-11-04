import { normalizeWhitespace, type ElementText } from "./text_matcher";

export type TextRoot = Element | ShadowRoot;
export type TextCache = Map<TextRoot, ElementText>;
/** Embedded hF qt: head/script/style/noscript content does not participate. */
export function shouldSkipForTextMatching(element: TextRoot) {
  const document = element.ownerDocument;
  return (
    element.nodeName === "SCRIPT" ||
    element.nodeName === "NOSCRIPT" ||
    element.nodeName === "STYLE" ||
    (document.head && document.head.contains(element))
  );
}
/** Embedded hF q: DOM text and immediate text chunks, cached by node identity. */
export function elementText(cache: TextCache, root: TextRoot): ElementText {
  let result = cache.get(root);
  if (result === undefined) {
    result = { full: "", normalized: "", immediate: [] };
    if (!shouldSkipForTextMatching(root)) {
      let currentImmediate = "";
      if (
        root instanceof HTMLInputElement &&
        (root.type === "submit" || root.type === "button")
      ) {
        result = {
          full: root.value,
          normalized: normalizeWhitespace(root.value),
          immediate: [root.value],
        };
      } else {
        for (let child = root.firstChild; child; child = child.nextSibling) {
          if (child.nodeType === Node.TEXT_NODE) {
            result.full += child.nodeValue || "";
            currentImmediate += child.nodeValue || "";
          } else {
            if (child.nodeType === Node.COMMENT_NODE) continue;
            if (currentImmediate) result.immediate.push(currentImmediate);
            currentImmediate = "";
            if (child.nodeType === Node.ELEMENT_NODE)
              result.full += elementText(cache, child as Element).full;
          }
        }
        if (currentImmediate) result.immediate.push(currentImmediate);
        const shadowRoot = (root as Element).shadowRoot;
        if (shadowRoot) result.full += elementText(cache, shadowRoot).full;
        if (result.full) result.normalized = normalizeWhitespace(result.full);
      }
    }
    cache.set(root, result);
  }
  return result;
}
/** Embedded hF st: distinguishes a match inherited from an immediate child. */
export function elementMatchesText(
  cache: TextCache,
  element: Element,
  matcher: (text: ElementText) => boolean,
): "none" | "self" | "selfAndChildren" {
  if (
    shouldSkipForTextMatching(element) ||
    !matcher(elementText(cache, element))
  )
    return "none";
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      matcher(elementText(cache, child as Element))
    )
      return "selfAndChildren";
  }
  return element.shadowRoot && matcher(elementText(cache, element.shadowRoot))
    ? "selfAndChildren"
    : "self";
}
/** Embedded hF Ar: resolve within the document or current shadow root only. */
export function enclosingQueryRoot(
  element: Element,
): Document | DocumentFragment | undefined {
  let root: Node = element;
  while (root.parentNode) root = root.parentNode;
  if (root.nodeType === 11 || root.nodeType === 9)
    return root as Document | DocumentFragment;
}
/** Embedded hF le: space-separated IDREFs, deduplicated in reference order. */
export function referencedElements(
  element: Element,
  references: string | null,
): Element[] {
  if (!references) return [];
  const root = enclosingQueryRoot(element);
  if (!root) return [];
  try {
    const ids = references.split(" ").filter((id) => !!id);
    const result: Element[] = [];
    for (const id of ids) {
      const target = root.querySelector("#" + CSS.escape(id));
      if (target && !result.includes(target)) result.push(target);
    }
    return result;
  } catch {
    return [];
  }
}
/** Embedded hF Wr: absent or unresolved aria-labelledby permits fallback. */
export function ariaLabelledByElements(element: Element) {
  const references = element.getAttribute("aria-labelledby");
  if (references === null) return null;
  const elements = referencedElements(element, references);
  return elements.length ? elements : null;
}
/** Embedded hF dn: labelledby → nonblank aria-label → native labels. */
export function elementLabels(
  cache: TextCache,
  element: Element,
): ElementText[] {
  const references = ariaLabelledByElements(element);
  if (references) return references.map((label) => elementText(cache, label));
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel !== null && ariaLabel.trim())
    return [
      {
        full: ariaLabel,
        normalized: normalizeWhitespace(ariaLabel),
        immediate: [ariaLabel],
      },
    ];
  const input =
    element.nodeName === "INPUT" &&
    (element as HTMLInputElement).type !== "hidden";
  if (
    ["BUTTON", "METER", "OUTPUT", "PROGRESS", "SELECT", "TEXTAREA"].includes(
      element.nodeName,
    ) ||
    input
  ) {
    const labels = (element as HTMLInputElement).labels;
    if (labels) return [...labels].map((label) => elementText(cache, label));
  }
  return [];
}
