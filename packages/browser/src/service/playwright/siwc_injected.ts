/** Current PF. Runs inside the Playwright isolated world; no host dependencies. */
export function installSiwcHelpers(injected: any) {
  const documentToken = crypto.getRandomValues(new Uint32Array(4)).join("-");
  injected._lastAriaSnapshotForQuery ??= {
    elements: new Map(),
    refs: new Map(),
  };
  let generation = 0;
  let nextRef = 0;
  let previousSnapshot: any;
  injected.siwcDocumentId = () => {
    if (previousSnapshot !== injected._lastAriaSnapshotForQuery) {
      previousSnapshot = injected._lastAriaSnapshotForQuery;
      ++generation;
    }
    return `${documentToken}:${generation}`;
  };
  injected.isSiwcControl = (element: Element) => {
    if (!element.isConnected || element.ownerDocument !== document)
      return false;
    let root = element.getRootNode();
    while (root instanceof ShadowRoot) {
      if (root.mode !== "open") return false;
      root = root.host.getRootNode();
    }
    if (root !== document) return false;
    if (element.hasAttribute("data-oai-siwc-button")) return true;
    if (element.nodeName === "LINK") return false;
    if (element.nodeName === "A" || element.nodeName === "BUTTON") return true;
    const role = injected.utils.getAriaRole(element);
    return role === "button" || role === "link";
  };
  injected.siwcRef = (element: Element) => {
    if (!injected.isSiwcControl(element))
      throw new Error("SIWC target is unavailable");
    injected.siwcDocumentId();
    const snapshot = injected._lastAriaSnapshotForQuery;
    let ref = snapshot.refs.get(element);
    if (ref == null) {
      ref = `s${++nextRef}`;
      snapshot.refs.set(element, ref);
      snapshot.elements.set(ref, element);
    }
    return ref;
  };
  injected.siwcDetect = () => {
    const root = document.documentElement;
    if (!root) throw new Error("SIWC document is unavailable");
    const textCache = new Map();
    const candidates = [];
    const excluded = new Set(
      injected.querySelectorAll(
        injected.parseSelector(
          "css=script,style,noscript,textarea,select,input:not([type=button i],[type=submit i],[type=reset i],[type=image i])",
        ),
        root,
      ),
    );
    for (const element of excluded)
      textCache.set(element, { full: "", normalized: "", immediate: [] });
    const elements = injected.querySelectorAll(
      injected.parseSelector(
        "css=[data-oai-siwc-button],button,a,input[type=button i],input[type=submit i],input[type=reset i],input[type=image i],[role]",
      ),
      root,
    );
    for (const element of elements) {
      if (!injected.isSiwcControl(element)) continue;
      const marked = element.hasAttribute("data-oai-siwc-button");
      const text = injected.utils.elementText(textCache, element).normalized;
      const name = injected.utils.getElementAccessibleName(
        element,
        true,
        excluded,
      );
      if (!marked && !/chatgpt/i.test(text) && !/chatgpt/i.test(name)) continue;
      candidates.push({
        evidence: marked ? "siwc_marker_detected" : "chatgpt_button_detected",
        label: text || name || undefined,
        ref: injected.siwcRef(element),
        visibility:
          injected.elementState(element, "visible").matches === true
            ? "rendered"
            : "hidden",
      });
    }
    return candidates;
  };
}
