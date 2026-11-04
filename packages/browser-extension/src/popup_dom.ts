/** Original Ny: callable in MAIN world through Chrome function serialization. */
export function hasPopupInterceptor(key: string): boolean {
  return (globalThis as any)[key] != null;
}
/** Original Uy: isolated-world bridge; one request per trusted interaction. */
export function installPopupBridge(
  key: string,
  requestEvent: string,
  messageType: string,
): void {
  const global = globalThis as any;
  if (global[key] != null) return;
  let used = false;
  const resetPopupAllowance = (event: Event) => {
    if (event.isTrusted) used = false;
  };
  const listener = (event: Event) => {
    if (
      !(event instanceof CustomEvent) ||
      navigator.userActivation?.isActive === false
    )
      return;
    if (used) {
      event.preventDefault();
      return;
    }
    const url = event.detail;
    if (typeof url === "string") {
      used = true;
      chrome.runtime.sendMessage({ type: messageType, url }).catch(() => {});
    }
  };
  document.addEventListener("click", resetPopupAllowance, true);
  document.addEventListener("keydown", resetPopupAllowance, true);
  document.addEventListener(requestEvent, listener);
  global[key] = { listener, requestEvent, resetPopupAllowance };
}
/** Original $y: self-contained MAIN-world window.open and anchor interception. */
export function installPopupInterceptor(
  key: string,
  requestEvent: string,
): void {
  const global = globalThis as any;
  if (global[key] != null) return;
  const originalOpen = window.open;
  const request = (value: string) => {
    if (navigator.userActivation?.isActive === false) return;
    let url: URL;
    try {
      url = new URL(value, document.baseURI);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    return document.dispatchEvent(
      new CustomEvent(requestEvent, { cancelable: true, detail: url.href }),
    );
  };
  const existingTarget = (target: string) =>
    ["_self", "_parent", "_top", "_unfencedtop"].includes(
      target.toLowerCase(),
    ) ||
    Array.from(document.querySelectorAll("iframe, frame")).some(
      (frame) => frame.getAttribute("name") === target,
    );
  const interceptedOpen = (
    url?: string | URL,
    target?: string,
    features?: string,
  ): Window | null => {
    if (url == null || url === "" || existingTarget(String(target ?? "")))
      return originalOpen.call(window, url, target, features);
    const accepted = request(String(url));
    if (accepted == null)
      return originalOpen.call(window, url, target, features);
    if (
      !accepted ||
      features
        ?.split(",")
        .some((feature) =>
          /^(?:noopener|noreferrer)(?:\s*=\s*(?:1|yes|true))?$/i.test(
            feature.trim(),
          ),
        )
    )
      return null;
    return { closed: false, focus: () => {} } as Window;
  };
  const clickListener = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = event
      .composedPath()
      .find((element) => element instanceof HTMLAnchorElement) as
      HTMLAnchorElement | undefined;
    if (
      anchor == null ||
      (anchor.hasAttribute("download") &&
        anchor.origin === window.location.origin)
    )
      return;
    const target = anchor.target;
    if (target === "" || existingTarget(target)) return;
    if (request(anchor.href) != null) event.preventDefault();
  };
  const captureClickListener = () => {
    window.removeEventListener("click", clickListener);
    window.addEventListener("click", clickListener, { once: true });
  };
  window.open = interceptedOpen;
  window.addEventListener("click", captureClickListener, true);
  global[key] = {
    captureClickListener,
    clickListener,
    interceptedOpen,
    originalOpen,
  };
}
/** Original Fy/By: restore window.open only if our wrapper still owns it. */
export function removePopupInterceptor(key: string): void {
  const global = globalThis as any,
    state = global[key];
  if (state == null || typeof state !== "object") return;
  window.removeEventListener("click", state.captureClickListener, true);
  window.removeEventListener("click", state.clickListener);
  if (window.open === state.interceptedOpen) window.open = state.originalOpen;
  Reflect.deleteProperty(global, key);
}
export function removePopupBridge(key: string): void {
  const global = globalThis as any,
    state = global[key];
  if (state == null || typeof state !== "object") return;
  document.removeEventListener("click", state.resetPopupAllowance, true);
  document.removeEventListener("keydown", state.resetPopupAllowance, true);
  document.removeEventListener(state.requestEvent, state.listener);
  Reflect.deleteProperty(global, key);
}
