export interface SidePanelSelectionSnapshot {
  selectedText: string | null;
  revision: number;
  captureGeneration: number;
  needsRecovery?: boolean;
}
export interface SidePanelSelectionRecovery {
  captureGeneration: number;
  selectedText: string | null;
}
/** Original sidepanel Ee. Self-contained because Chrome serializes this function
 * into the selected page. No imported helpers may be referenced in its body. */
export function observeSidePanelSelection(
  expectedUrl: string,
  observerId: string,
  recoveryMode: "none" | "event" | "polling" = "none",
  recovery?: SidePanelSelectionRecovery,
): SidePanelSelectionSnapshot | null {
  if (location.href !== expectedUrl) return null;
  const page = globalThis as typeof globalThis & {
    __codexSideChatSelectionObserver?: {
      id: string;
      read(
        recovery?: SidePanelSelectionRecovery,
      ): SidePanelSelectionSnapshot | null;
      remove(): void;
    };
  };
  if (
    recovery != null &&
    page.__codexSideChatSelectionObserver?.id !== observerId
  )
    return null;
  if (page.__codexSideChatSelectionObserver?.id !== observerId) {
    page.__codexSideChatSelectionObserver?.remove();
    let selectedText: string | null = null;
    let revision = 0,
      captureGeneration = 0;
    let needsRecovery = recoveryMode !== "none";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (
      recovered?: SidePanelSelectionRecovery,
    ): SidePanelSelectionSnapshot | null => {
      if (recovered != null) {
        if (recovered.captureGeneration !== captureGeneration) return null;
        captureGeneration++;
        needsRecovery = false;
        if (recovered.selectedText !== selectedText) {
          selectedText = recovered.selectedText;
          revision++;
        }
      } else {
        const current =
          window.getSelection()?.toString().slice(0, 80000) || null;
        if (recoveryMode === "none" || current != null) {
          needsRecovery = false;
          if (current !== selectedText) {
            selectedText = current;
            revision++;
            captureGeneration++;
          }
        } else if (recoveryMode === "polling" && document.hasFocus())
          needsRecovery = true;
      }
      return {
        selectedText,
        revision,
        captureGeneration,
        ...(recoveryMode === "none" ? {} : { needsRecovery }),
      };
    };
    const changed = () => {
      const previous = revision;
      if (recoveryMode === "none" && read()?.revision === previous) return;
      if (recoveryMode !== "none") {
        needsRecovery = true;
        captureGeneration++;
        if (timer != null) clearTimeout(timer);
        timer = setTimeout(notify, 75);
      } else notify();
    };
    const notify = () => {
      timer = undefined;
      try {
        chrome.runtime
          .sendMessage({
            type: "CODEX_SIDE_CHAT_SELECTION_CHANGED",
            observerId,
          })
          .catch(() => {});
      } catch {
        remove();
      }
    };
    const events =
      recoveryMode === "none"
        ? ["selectionchange"]
        : ["keyup", "mouseup", "pointerup"];
    const documents = new Set<Document>();
    const observe = (target: Document) => {
      if (documents.has(target)) return;
      documents.add(target);
      for (const event of events) target.addEventListener(event, changed, true);
    };
    const refreshFrames = (event?: Event) => {
      if (event != null && !(event.target instanceof HTMLIFrameElement)) return;
      for (const target of documents)
        if (target !== document) {
          for (const name of events)
            target.removeEventListener(name, changed, true);
          documents.delete(target);
        }
      for (const frame of document.querySelectorAll("iframe"))
        try {
          if (frame.contentDocument != null) observe(frame.contentDocument);
        } catch {}
    };
    const remove = () => {
      for (const target of documents)
        for (const event of events)
          target.removeEventListener(event, changed, true);
      document.removeEventListener("load", refreshFrames, true);
      if (timer != null) clearTimeout(timer);
      window.removeEventListener("pagehide", remove);
      if (page.__codexSideChatSelectionObserver?.id === observerId)
        delete page.__codexSideChatSelectionObserver;
    };
    page.__codexSideChatSelectionObserver = { id: observerId, read, remove };
    observe(document);
    if (recoveryMode !== "none") {
      refreshFrames();
      document.addEventListener("load", refreshFrames, true);
    }
    window.addEventListener("pagehide", remove, { once: true });
  }
  return page.__codexSideChatSelectionObserver.read(recovery);
}
/** Original sidepanel et. Serialized page cleanup, scoped to the observer id. */
export function removeSidePanelSelectionObserver(observerId: string) {
  const page = globalThis as typeof globalThis & {
    __codexSideChatSelectionObserver?: { id: string; remove(): void };
  };
  if (page.__codexSideChatSelectionObserver?.id === observerId)
    page.__codexSideChatSelectionObserver.remove();
}
