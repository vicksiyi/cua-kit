const rootId = "codex-agent-overlay-root";
const rootFlag = "codexAgentOverlayRoot";
const overlayCss =
  ".codex-agent-overlay{all:initial;z-index:2147483646;pointer-events:none;position:fixed;inset:0}@media print{.codex-agent-overlay{display:none}}";
/** Original Q/T/Hn/ze. Rendering Dn is required, not replaced by a placeholder. */
export function createOverlayRoot(host: {
  document: Document;
  HTMLDivElement: typeof HTMLDivElement;
  MutationObserver: typeof MutationObserver;
  render(container: HTMLDivElement): () => void;
}) {
  const document = host.document;
  let root: HTMLDivElement | null = null;
  let observer: MutationObserver | null = null;
  let observed: Node[] = [];
  let disposeRenderer: (() => void) | null = null;
  let suppressedDocumentElement: HTMLElement | null = null;
  function disconnect() {
    observer?.disconnect();
    observed = [];
  }
  function remove() {
    disconnect();
    disposeRenderer?.();
    root?.remove();
    disposeRenderer = null;
    root = null;
  }
  function observe(node: Node) {
    const targets = node.parentNode == null ? [node] : [node, node.parentNode];
    if (
      targets.length === observed.length &&
      targets.every((target, index) => target === observed[index])
    )
      return;
    if (observer == null)
      observer = new host.MutationObserver(() => {
        if (root?.isConnected === true) {
          const parent = root.parentNode;
          if (parent != null) observe(parent);
          return;
        }
        if (root == null) {
          if (suppressedDocumentElement !== document.documentElement) ensure();
          return;
        }
        const previous = observed[0];
        if (
          previous != null &&
          !previous.isConnected &&
          previous !== document.documentElement
        ) {
          ensure();
          return;
        }
        suppressedDocumentElement = document.documentElement;
        remove();
        observe(document);
      });
    else if (observed.length > 0) observer.disconnect();
    observed = targets;
    for (const target of targets) observer.observe(target, { childList: true });
  }
  function ensure(): boolean {
    if (
      root?.isConnected === true &&
      document.getElementById(rootId) === root
    ) {
      const parent = root.parentNode;
      if (parent != null) observe(parent);
      return true;
    }
    if (
      root == null &&
      suppressedDocumentElement != null &&
      suppressedDocumentElement === document.documentElement
    )
      return false;
    remove();
    const existing = document.getElementById(rootId);
    if (existing != null) {
      if (
        existing instanceof host.HTMLDivElement &&
        existing.dataset[rootFlag] === "true"
      )
        existing.remove();
      else {
        if (existing.parentNode != null) observe(existing.parentNode);
        return false;
      }
    }
    const element = document.documentElement;
    if (!element) {
      observe(document);
      return false;
    }
    suppressedDocumentElement = null;
    const next = document.createElement("div");
    next.id = rootId;
    next.dataset[rootFlag] = "true";
    element.appendChild(next);
    const shadow = next.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = overlayCss;
    shadow.appendChild(style);
    const container = document.createElement("div");
    shadow.appendChild(container);
    disposeRenderer = host.render(container);
    root = next;
    observe(element);
    return true;
  }
  return { ensure, disconnect, remove };
}
