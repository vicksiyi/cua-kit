import {
  credentialFieldPolicy,
  isCredentialField,
} from "../clipboard/page_execution";
import type { Clip } from "./dom_state";
export const visibleDomTags = [
  "a",
  "button",
  "details",
  "input",
  "option",
  "select",
  "summary",
  "textarea",
];
export const visibleDomAttributes = [
  "aria-disabled",
  "aria-label",
  "contenteditable",
  "href",
  "name",
  "placeholder",
  "role",
  "title",
  "type",
  "value",
];
export const visibleDomBooleanAttributes = [
  "checked",
  "disabled",
  "multiple",
  "readonly",
  "required",
  "selected",
];
export const visibleDomRoles = [
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
];
export interface VisibleDomPageOptions {
  interactiveTags: string[];
  interactiveRoleNames: string[];
  renderedAttributeNames: string[];
  booleanAttributeNames: string[];
  codexOverlayRootId: string;
  maxChars: number;
  maxElements: number;
  reviewerOnly: boolean;
  viewportClip?: Clip;
}
/** Original _Y. Entire function is serialized into the isolated page world. */
export function collectVisibleDom(
  options: VisibleDomPageOptions,
  credential: typeof isCredentialField,
  policy: typeof credentialFieldPolicy,
) {
  const tags = new Set(options.interactiveTags),
    roles = new Set(options.interactiveRoleNames);
  const frames: {
      rect: Clip;
      ref: string;
      size: { height: number; width: number };
      url?: string;
    }[] = [],
    items: { line: string; ref: string }[] = [];
  let chars = 0,
    truncated = false;
  const globals = globalThis as any;
  const state = (globals[
    options.reviewerOnly
      ? "__browserUseReviewerVisibleDomState"
      : "__browserUseVisibleDomState"
  ] ??= { elementToRef: new WeakMap(), nextId: 1, refToElement: new Map() });
  state.refToElement.clear();
  const visual = window.visualViewport;
  const viewport = visual
    ? {
        bottom: visual.offsetTop + visual.height,
        left: visual.offsetLeft,
        right: visual.offsetLeft + visual.width,
        top: visual.offsetTop,
      }
    : { bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0 };
  const clip =
    options.viewportClip == null
      ? viewport
      : {
          bottom: Math.min(viewport.bottom, options.viewportClip.bottom),
          left: Math.max(viewport.left, options.viewportClip.left),
          right: Math.min(viewport.right, options.viewportClip.right),
          top: Math.max(viewport.top, options.viewportClip.top),
        };
  const tag = (element: any) =>
    (element.localName || element.nodeName || "").toLowerCase();
  const skipped = new Set(["noscript", "script", "style", "template"]);
  const overlay = (element: Element) =>
    element.getAttribute("id") === options.codexOverlayRootId;
  const interactive = (element: Element) => {
    const name = tag(element);
    if (
      element.getAttribute("aria-hidden") === "true" ||
      element.hasAttribute("hidden") ||
      (name === "input" && element.getAttribute("type") === "hidden")
    )
      return false;
    const editable = element.getAttribute("contenteditable"),
      role = element.getAttribute("role");
    return (
      tags.has(name) ||
      (editable != null && editable.toLowerCase() !== "false") ||
      element.hasAttribute("href") ||
      element.hasAttribute("onclick") ||
      (role != null && roles.has(role.trim().toLowerCase())) ||
      Number(element.getAttribute("tabindex") ?? -1) >= 0 ||
      (options.reviewerOnly &&
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            (node.nodeValue ?? "").trim().length > 0,
        ))
    );
  };
  const isFrame = (element: Element) => {
    const name = tag(element);
    return name === "frame" || name === "iframe";
  };
  const rect = (element: Element): Clip | null => {
    const style = window.getComputedStyle(element);
    if (
      style.visibility !== "visible" ||
      style.display === "none" ||
      style.pointerEvents === "none" ||
      Number(style.opacity) <= 0.01
    )
      return null;
    for (const bounds of element.getClientRects())
      if (!(
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        bounds.right <= clip.left ||
        bounds.left >= clip.right ||
        bounds.bottom <= clip.top ||
        bounds.top >= clip.bottom
      ))
        return {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
    return null;
  };
  const visible = (element: Element) => rect(element) != null;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const escape = (text: string) =>
    text
      .replace(/[\t\n\f\r]+/g, " ")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const label = (element: Element) => {
    const parts: string[] = [];
    let length = 0;
    const visit = (node: any) => {
      if (length >= 160) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = normalize(node.nodeValue || "");
        if (text.length > 0) {
          parts.push(text);
          length += text.length + 1;
        }
        return;
      }
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (skipped.has(tag(node)) ||
          (options.reviewerOnly && tag(node) === "textarea") ||
          (options.reviewerOnly &&
            (node.getAttribute("aria-hidden") === "true" ||
              node.hasAttribute("hidden"))))
      )
        return;
      if (node instanceof HTMLTextAreaElement) {
        if (credential(node, policy)) return;
        const text = normalize(node.value);
        if (text.length > 0) {
          parts.push(text);
          length += text.length + 1;
        }
        return;
      }
      for (const child of node.childNodes || []) {
        if (length >= 160) break;
        visit(child);
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (!node.shadowRoot) return;
        for (const child of node.shadowRoot.childNodes) {
          if (length >= 160) break;
          visit(child);
        }
      }
    };
    visit(element);
    return normalize(parts.join(" ")).slice(0, 160);
  };
  const reference = (element: Element): string => {
    let ref = state.elementToRef.get(element);
    if (ref == null) {
      ref = String(state.nextId++);
      state.elementToRef.set(element, ref);
    }
    return ref;
  };
  const render = (element: Element, ref: string) => {
    const name = tag(element),
      attributes = [`node_id=${ref}`];
    for (const attribute of options.renderedAttributeNames) {
      if (
        attribute === "value" &&
        (credential(element, policy) ||
          (options.reviewerOnly &&
            (name === "input" || name === "textarea" || name === "select")))
      ) {
        if (
          !options.reviewerOnly &&
          (element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement) &&
          element.value
        )
          attributes.push('value="<redacted>"');
        continue;
      }
      const value =
        attribute === "value" &&
        ((element instanceof HTMLInputElement &&
          element.type !== "checkbox" &&
          element.type !== "radio") ||
          element instanceof HTMLSelectElement)
          ? element.value
          : element.getAttribute(attribute);
      if (value != null && value !== "")
        attributes.push(`${attribute}="${escape(value)}"`);
    }
    for (const attribute of options.booleanAttributeNames)
      if (
        attribute === "checked" && element instanceof HTMLInputElement
          ? element.checked
          : attribute === "selected" && element instanceof HTMLOptionElement
            ? element.selected
            : element.hasAttribute(attribute)
      )
        attributes.push(`${attribute}="true"`);
    if (element instanceof HTMLInputElement && element.indeterminate)
      attributes.push('indeterminate="true"');
    const text = label(element);
    return text.length === 0
      ? `<${name} ${attributes.join(" ")} />`
      : `<${name} ${attributes.join(" ")}>${escape(text)}</${name}>`;
  };
  const full = () =>
    truncated ||
    items.length >= options.maxElements ||
    chars >= options.maxChars;
  const append = (element: Element) => {
    if (full()) return;
    const ref = reference(element),
      line = render(element, ref),
      length = line.length + (items.length === 0 ? 0 : 1);
    if (chars + length > options.maxChars) {
      truncated = true;
      return;
    }
    items.push({ line, ref });
    state.refToElement.set(ref, element);
    chars += length;
  };
  const appendFrame = (element: any) => {
    if (frames.length >= options.maxElements) return;
    const bounds = rect(element);
    if (bounds == null) return;
    const ref = reference(element);
    if (frames.some((frame) => frame.ref === ref)) return;
    const source = element.src,
      width =
        element.clientWidth > 0
          ? element.clientWidth
          : bounds.right - bounds.left,
      height =
        element.clientHeight > 0
          ? element.clientHeight
          : bounds.bottom - bounds.top;
    frames.push({
      rect: bounds,
      ref,
      size: { height, width },
      ...(source.length > 0 ? { url: source } : {}),
    });
    state.refToElement.set(ref, element);
  };
  if (options.reviewerOnly)
    for (const element of document.querySelectorAll("iframe, frame"))
      if (element.closest(`#${options.codexOverlayRootId}`) == null)
        appendFrame(element);
  const traverse = (node: any) => {
    if (full()) return;
    if (node.nodeType === Node.DOCUMENT_NODE) {
      const root = node.documentElement;
      if (root) traverse(root);
      return;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (const child of node.children) {
        if (full()) break;
        traverse(child);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (!overlay(node)) {
      if (isFrame(node)) appendFrame(node);
      if (interactive(node) && visible(node)) append(node);
      if (node.shadowRoot && !full()) traverse(node.shadowRoot);
      for (const child of node.children) {
        if (full()) break;
        traverse(child);
      }
    }
  };
  traverse(document);
  return { frameElements: frames, items, viewport };
}
/** Original cY, with restored Ms/no field protection and unchanged option data. */
export function visibleDomExpression(
  maxChars: number,
  maxElements: number,
  viewportClip: Clip | undefined,
  reviewerOnly: boolean,
) {
  const options: VisibleDomPageOptions = {
    booleanAttributeNames: visibleDomBooleanAttributes,
    codexOverlayRootId: "codex-agent-overlay-root",
    interactiveRoleNames: visibleDomRoles,
    interactiveTags: [...visibleDomTags],
    maxChars,
    maxElements,
    renderedAttributeNames: visibleDomAttributes,
    reviewerOnly,
    viewportClip,
  };
  return `(() => {\n    const __name = (target) => target;\n    return (${collectVisibleDom.toString()})(\n      ${JSON.stringify(options)},\n      ${isCredentialField.toString()},\n      ${JSON.stringify(credentialFieldPolicy)},\n    );\n  })()`;
}
