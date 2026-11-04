/** Embedded hF xi/St/$/kr/ye/X/Cr/Ze/Q/Nr/_/_t/Tt. */
interface BrowserWorkarounds {
  browserNameForWorkarounds?: string;
}
let workarounds: BrowserWorkarounds = {};
export function setBrowserWorkarounds(options: BrowserWorkarounds) {
  workarounds = options;
}
export function parentElementOrShadowHost(
  element: Element,
): Element | undefined {
  if (element.parentElement) return element.parentElement;
  if (
    element.parentNode &&
    element.parentNode.nodeType === 11 &&
    (element.parentNode as ShadowRoot).host
  )
    return (element.parentNode as ShadowRoot).host;
}
export function enclosingShadowHost(element: Element): Element | undefined {
  while (element.parentElement) element = element.parentElement;
  return parentElementOrShadowHost(element);
}
export function containsAcrossShadowRoots(
  container: Element,
  candidate: Element | undefined,
): boolean {
  while (candidate) {
    if (container.contains(candidate)) return true;
    candidate = enclosingShadowHost(candidate);
  }
  return false;
}
export function closestAcrossShadowRoots(
  element: Element | undefined,
  selector: string,
  scope?: Element,
): Element | undefined {
  while (element) {
    const match = element.closest(selector);
    if (scope && match !== scope && match?.contains(scope)) return;
    if (match) return match;
    element = enclosingShadowHost(element);
  }
}
type StyleCache = Map<Element, CSSStyleDeclaration | undefined>;
let elementStyles: StyleCache | undefined;
let beforeStyles: StyleCache | undefined;
let afterStyles: StyleCache | undefined;
let cacheUsers = 0;
export function beginStyleCaches() {
  ++cacheUsers;
  elementStyles ??= new Map();
  beforeStyles ??= new Map();
  afterStyles ??= new Map();
}
export function endStyleCaches() {
  if (!--cacheUsers) {
    elementStyles = undefined;
    beforeStyles = undefined;
    afterStyles = undefined;
  }
}
export function computedStyle(
  element: Element,
  pseudo?: string,
): CSSStyleDeclaration | undefined {
  const cache =
    pseudo === "::before"
      ? beforeStyles
      : pseudo === "::after"
        ? afterStyles
        : elementStyles;
  if (cache && cache.has(element)) return cache.get(element);
  const style =
    element.ownerDocument && element.ownerDocument.defaultView
      ? element.ownerDocument.defaultView.getComputedStyle(element, pseudo)
      : undefined;
  cache?.set(element, style);
  return style;
}
export function isStyleVisible(
  element: Element,
  style?: CSSStyleDeclaration,
): boolean {
  style = style ?? computedStyle(element);
  if (!style) return true;
  if (
    (Element.prototype as Partial<Pick<Element, "checkVisibility">>)
      .checkVisibility &&
    workarounds.browserNameForWorkarounds !== "webkit"
  ) {
    if (!element.checkVisibility()) return false;
  } else {
    const details = element.closest("details,summary");
    if (
      details !== element &&
      details?.nodeName === "DETAILS" &&
      !(details as HTMLDetailsElement).open
    )
      return false;
  }
  return style.visibility === "visible";
}
export interface ElementVisibility {
  visible: boolean;
  inline: boolean;
  cursor?: string;
}
export function elementVisibility(element: Element): ElementVisibility {
  const style = computedStyle(element);
  if (!style) return { visible: true, inline: false };
  const cursor = style.cursor;
  if (style.display === "contents") {
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 && isElementVisible(child as Element))
        return { visible: true, inline: false, cursor };
      if (child.nodeType === 3 && isTextNodeVisible(child as Text))
        return { visible: true, inline: true, cursor };
    }
    return { visible: false, inline: false, cursor };
  }
  if (!isStyleVisible(element, style))
    return { cursor, visible: false, inline: false };
  const rectangle = element.getBoundingClientRect();
  return {
    cursor,
    visible: rectangle.width > 0 && rectangle.height > 0,
    inline: style.display === "inline",
  };
}
export function isElementVisible(element: Element) {
  return elementVisibility(element).visible;
}
export function isTextNodeVisible(node: Text) {
  const range = node.ownerDocument.createRange();
  range.selectNode(node);
  const rectangle = range.getBoundingClientRect();
  return rectangle.width > 0 && rectangle.height > 0;
}
export function safeElementTagName(element: Element): string {
  const tagName = element.tagName;
  return typeof tagName === "string"
    ? tagName.toUpperCase()
    : element instanceof HTMLFormElement
      ? "FORM"
      : element.tagName.toUpperCase();
}
