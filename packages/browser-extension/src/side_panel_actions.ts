import { isChatGptPageSender } from "./tab_mention_messages";
import { sidePanelInvocationKey } from "./side_panel_tabs";
type Invocation =
  | { createdAtMs: number; kind: "prompt"; mode?: "work"; prompt?: string }
  | {
      createdAtMs: number;
      kind: "selection";
      selectedText: string;
      tabId: number;
      tabUrl: string;
      url: string;
    };
/** Original xk/Bf/Mk/Lk. Opening is immediate; prefill persistence waits for success. */
export function createSidePanelActions(host: {
  chrome: Pick<
    typeof chrome,
    "runtime" | "sidePanel" | "storage" | "contextMenus"
  >;
  open(
    windowId: number,
    tabId: number | undefined,
    source: string,
  ): Promise<void>;
  now(): number;
}) {
  function openWithInvocation(
    windowId: number,
    tabId: number,
    source: string,
    invocation?: Invocation,
  ) {
    host
      .open(windowId, tabId, source)
      .then(async () => {
        if (
          invocation == null ||
          (invocation.kind !== "prompt" &&
            invocation.selectedText.trim().length === 0)
        )
          return;
        const value = {
          type: "browser_side_chat_prompt_prefill",
          createdAtMs: invocation.createdAtMs,
          mode: invocation.kind === "prompt" ? invocation.mode : undefined,
          prompt: invocation.kind === "prompt" ? invocation.prompt : undefined,
          selectedText:
            invocation.kind === "selection"
              ? invocation.selectedText.slice(0, 80000)
              : undefined,
        };
        await host.chrome.storage.session.set({
          [sidePanelInvocationKey(tabId)]: value,
        });
      })
      .catch(() => {});
  }
  function handleWebsiteOpen(
    message: any,
    sender: chrome.runtime.MessageSender,
    channel: string,
  ) {
    const windowId = sender.tab?.windowId,
      tabId = sender.tab?.id;
    if (
      message == null ||
      typeof message !== "object" ||
      message.type !== "OPEN_CODEX_SIDE_PANEL" ||
      !isChatGptPageSender(sender, channel, host.chrome.runtime.id) ||
      windowId == null ||
      tabId == null ||
      typeof host.chrome.sidePanel?.open !== "function"
    )
      return false;
    const source =
      message.source === undefined ? "chatgpt_website" : message.source;
    if (
      typeof source !== "string" ||
      (message.mode !== undefined && message.mode !== "work")
    )
      return false;
    const prompt =
      typeof message.prompt === "string" &&
      message.prompt.length <= 8192 &&
      message.prompt.trim().length > 0
        ? message.prompt
        : undefined;
    openWithInvocation(
      windowId,
      tabId,
      source,
      prompt != null || message.mode === "work"
        ? {
            createdAtMs: host.now(),
            kind: "prompt",
            mode: message.mode,
            prompt,
          }
        : undefined,
    );
    return true;
  }
  function createContextMenu() {
    if (host.chrome.sidePanel != null)
      host.chrome.contextMenus.create({
        contexts: [
          "page",
          "frame",
          "selection",
          "link",
          "editable",
          "image",
          "video",
          "audio",
        ],
        id: "ask-chatgpt",
        title: "Ask ChatGPT",
      });
  }
  function registerContextMenu() {
    host.chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId !== "ask-chatgpt") return;
      const tabId = tab?.id,
        windowId = tab?.windowId;
      const tabUrl = tab?.url ?? tab?.pendingUrl ?? info.pageUrl,
        url = info.frameUrl ?? info.pageUrl ?? tabUrl;
      if (tabId == null || windowId == null || tabUrl == null || url == null)
        return;
      openWithInvocation(windowId, tabId, "context_menu", {
        createdAtMs: host.now(),
        kind: "selection",
        selectedText: info.selectionText ?? "",
        tabId,
        tabUrl,
        url,
      });
    });
  }
  return {
    openWithInvocation,
    handleWebsiteOpen,
    createContextMenu,
    registerContextMenu,
  };
}
