/** Original jy, also R in foreign-frame-monitor.js. Self-contained for executeScript. */
export function installForeignFrameMonitor(
  key = "__codexForeignExtensionFrameMonitor",
): boolean {
  const global = globalThis as any;
  if (global[key] != null) return true;
  const readShadow = chrome.dom?.openOrClosedShadowRoot;
  const observedRoots = new WeakSet<Node>();
  const foreignExtension = (url: string | null): string | null => {
    if (url == null || !url.startsWith("chrome-extension://")) return null;
    try {
      const host = new URL(url).host;
      return host.length > 0 && host !== chrome.runtime.id ? host : null;
    } catch {
      return null;
    }
  };
  const frameSources = (element: Element) => {
    const attribute = element.getAttribute("src")?.trim() ?? "";
    return element instanceof HTMLIFrameElement
      ? { attrSrc: attribute, propertySrc: element.src?.trim() ?? "" }
      : { attrSrc: attribute, propertySrc: "" };
  };
  const shadowRoot = (element: Element): ShadowRoot | null => {
    if (!(element instanceof HTMLElement)) return null;
    if (typeof readShadow === "function")
      try {
        return readShadow(element);
      } catch {}
    return element.shadowRoot;
  };
  const inspectElement = (element: Element) => {
    const shadow = shadowRoot(element);
    if (element.tagName === "IFRAME" || element.tagName === "FRAME") {
      const sources = frameSources(element);
      if (
        (foreignExtension(sources.attrSrc) ??
          foreignExtension(sources.propertySrc)) != null
      ) {
        if (element instanceof HTMLIFrameElement) {
          if (element.getAttribute("srcdoc") === "") return;
          element.setAttribute("srcdoc", "");
          return;
        }
        element.setAttribute("src", "about:blank");
      }
    }
    if (shadow != null) observeRoot(shadow);
  };
  const scan = (root: Node) => {
    if (!(
      root instanceof Document ||
      root instanceof ShadowRoot ||
      root instanceof Element
    ))
      return;
    const inspect = (element: Element) => {
      inspectElement(element);
      const shadow = shadowRoot(element);
      if (shadow != null) scan(shadow);
    };
    if (root instanceof Element) inspect(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let element = walker.nextNode();
    while (element != null) {
      inspect(element as Element);
      element = walker.nextNode();
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element)
        inspectElement(record.target);
      for (const node of record.addedNodes) scan(node);
    }
  });
  const observeRoot = (root: Node) => {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    observer.observe(root, {
      attributeFilter: ["src"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    scan(root);
  };
  global[key] = { observer, observedRoots };
  try {
    observeRoot(document);
  } catch (error) {
    observer.disconnect();
    Reflect.deleteProperty(global, key);
    throw error;
  }
  return true;
}
/** Original Xy/tS; remain serializable without module-scope dependencies. */
export function hasForeignFrameMonitor(key: string): boolean {
  return (globalThis as any)[key] != null;
}
export function removeForeignFrameMonitor(key: string): void {
  const global = globalThis as any,
    state = global[key];
  if (state == null || typeof state !== "object") return;
  const observer = "observer" in state ? state.observer : undefined;
  (observer != null &&
  typeof observer === "object" &&
  "disconnect" in observer &&
  typeof observer.disconnect === "function"
    ? observer.disconnect
    : null
  )?.call(observer);
  Reflect.deleteProperty(global, key);
}
