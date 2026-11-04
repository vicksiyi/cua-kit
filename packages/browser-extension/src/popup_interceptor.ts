import type { createContentRuntime } from "./content_runtime";
import {
  hasPopupInterceptor,
  installPopupBridge,
  installPopupInterceptor,
  removePopupInterceptor,
  removePopupBridge,
} from "./popup_dom";
const stateKey = "__codexAgentPopupInterceptor";
const requestEvent = "__codexAgentBackgroundPopupRequest";
const messageType = "CODEX_OPEN_AGENT_BACKGROUND_POPUP";
/** Original Oy. URL parsing/ownership checks belong to the command handler. */
export function isAgentPopupRequest(
  value: unknown,
): value is { type: typeof messageType; url: string } {
  return (
    value != null &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "CODEX_OPEN_AGENT_BACKGROUND_POPUP" &&
    "url" in value &&
    typeof value.url === "string"
  );
}
/** Original Cy..Dy: isolated bridge must be installed before MAIN interception. */
export function createPopupInterceptor(host: {
  chrome: typeof chrome;
  contentRuntime: ReturnType<typeof createContentRuntime>;
  tabLeases: {
    getInstance(): {
      mightHaveActiveTabLease(tabId: number): boolean;
      getActiveLease(tabId: number): Promise<unknown>;
    };
  };
}) {
  const { chrome } = host,
    withTimeout = host.contentRuntime.withTimeout;
  const tracked = new Set<number>(),
    pending = new Map<number, Promise<boolean>>();
  let initialized = false;
  function initialize() {
    if (initialized) return;
    initialized = true;
    chrome.tabs.onRemoved?.addListener(handleRemoved);
    chrome.tabs.onReplaced?.addListener(handleReplaced);
    chrome.webNavigation?.onCommitted?.addListener(handleCommitted);
  }
  function track(tabId: number) {
    tracked.add(tabId);
  }
  async function ensure(tabId: number): Promise<boolean> {
    if (!tracked.has(tabId)) return false;
    let operation = pending.get(tabId);
    if (operation == null) {
      operation = inject(tabId);
      pending.set(tabId, operation);
      const current = operation;
      operation.finally(() => {
        if (pending.get(tabId) === current) pending.delete(tabId);
      });
    }
    return await operation;
  }
  async function remove(tabId: number): Promise<void> {
    const wasTracked = tracked.delete(tabId),
      operation = pending.get(tabId);
    if (!wasTracked && operation == null) return;
    if (operation != null) await operation.catch(() => {});
    pending.delete(tabId);
    await Promise.allSettled([
      withTimeout(
        chrome.scripting.executeScript({
          args: [stateKey],
          func: removePopupInterceptor,
          injectImmediately: true,
          target: { allFrames: true, tabId },
          world: "MAIN",
        }),
      ),
      withTimeout(
        chrome.scripting.executeScript({
          args: [stateKey],
          func: removePopupBridge,
          injectImmediately: true,
          target: { allFrames: true, tabId },
        }),
      ),
    ]);
  }
  async function inject(tabId: number): Promise<boolean> {
    if (!tracked.has(tabId)) return false;
    try {
      const present = await withTimeout(
        chrome.scripting.executeScript({
          args: [stateKey],
          func: hasPopupInterceptor,
          injectImmediately: true,
          target: { allFrames: true, tabId },
          world: "MAIN",
        }),
      );
      if (
        present != null &&
        present.length > 0 &&
        present.every((result) => result.result === true)
      )
        return tracked.has(tabId);
      if (
        (await withTimeout(
          chrome.scripting.executeScript({
            args: [stateKey, requestEvent, "CODEX_OPEN_AGENT_BACKGROUND_POPUP"],
            func: installPopupBridge,
            injectImmediately: true,
            target: { allFrames: true, tabId },
          }),
        )) == null ||
        !tracked.has(tabId)
      )
        return false;
      if (
        (await withTimeout(
          chrome.scripting.executeScript({
            args: [stateKey, requestEvent],
            func: installPopupInterceptor,
            injectImmediately: true,
            target: { allFrames: true, tabId },
            world: "MAIN",
          }),
        )) == null ||
        !tracked.has(tabId)
      )
        return false;
      return true;
    } catch {
      return false;
    }
  }
  function handleCommitted(info: { tabId: number }) {
    if (tracked.has(info.tabId)) refresh(info.tabId);
  }
  function refresh(tabId: number) {
    const leases = host.tabLeases.getInstance();
    if (leases.mightHaveActiveTabLease(tabId))
      leases
        .getActiveLease(tabId)
        .then(async (lease) => {
          if (lease != null && tracked.has(tabId)) await ensure(tabId);
        })
        .catch(() => {});
  }
  function handleReplaced(added: number, removed: number) {
    if (tracked.delete(removed)) {
      tracked.add(added);
      pending.delete(removed);
    }
  }
  function handleRemoved(tabId: number) {
    tracked.delete(tabId);
    pending.delete(tabId);
  }
  return {
    initialize,
    track,
    ensure,
    remove,
    inject,
    handleCommitted,
    refresh,
    handleReplaced,
    handleRemoved,
  };
}
/** Popup branch in original dR runtime handler. Other messages continue to later handlers. */
export function createPopupMessageHandler(handler: {
  handleAgentBackgroundPopup(tabId: number, url: string): Promise<unknown>;
}) {
  return (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    reply: (value: { ok: boolean }) => void,
  ): boolean => {
    if (!isAgentPopupRequest(message)) return false;
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") return false;
    handler
      .handleAgentBackgroundPopup(tabId, message.url)
      .then(() => reply({ ok: true }))
      .catch(() => reply({ ok: false }));
    return true;
  };
}
