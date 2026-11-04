import { isAgentPopupRequest } from "./popup_interceptor";
import { isChatGptPageSender } from "./tab_mention_messages";

type Reply = (value?: unknown) => void;
type MessageHandler = (
  message: any,
  sender: chrome.runtime.MessageSender,
  reply: Reply,
) => boolean;
export function isBrowserPageEvent(
  value: unknown,
): value is { version: 1; type: string; [key: string]: unknown } {
  return (
    typeof value === "object" &&
    value != null &&
    "version" in value &&
    value.version === 1 &&
    "type" in value &&
    typeof value.type === "string"
  );
}
/** Original dR page-event branch, shared by full and native-host startup. */
export function createPageEventHandler(host: {
  getActiveLease(
    tabId: number,
  ): Promise<{ sessionId: string } | null | undefined>;
  broadcastPageEvent(event: Record<string, unknown>): void;
}) {
  return (message: any, sender: chrome.runtime.MessageSender): boolean => {
    if (
      message?.type !== "codex:page-event" ||
      !isBrowserPageEvent(message.event)
    )
      return false;
    const tabId = sender.tab?.id;
    if (typeof tabId === "number" && Number.isInteger(tabId))
      host
        .getActiveLease(tabId)
        .then((lease) => {
          if (lease != null)
            host.broadcastPageEvent({
              ...message.event,
              session_id: lease.sessionId,
              tabId,
            });
        })
        .catch(() => {});
    return true;
  };
}
/** Original dR runtime listener: precedence and async reply lifetimes are significant. */
export function createBackgroundMessageRouter<Control>(host: {
  runtimeId: string;
  buildChannel: string;
  sidePanelInstance: MessageHandler;
  sidePanelAuth: MessageHandler;
  tabMentions: MessageHandler;
  youtubeTimestamp: (message: any, reply: Reply) => boolean;
  showInstaller: (
    message: any,
    sender: chrome.runtime.MessageSender,
  ) => boolean;
  sidePanelLoad: MessageHandler;
  openSidePanel: (
    message: any,
    sender: chrome.runtime.MessageSender,
  ) => boolean;
  cursor: MessageHandler;
  controls(): Iterable<Control>;
  refreshBrowserSettings(control: Control): Promise<unknown>;
  handleAgentBackgroundPopup(tabId: number, url: string): Promise<unknown>;
  getActiveLease(
    tabId: number,
  ): Promise<{ sessionId: string } | null | undefined>;
  broadcastPageEvent(event: Record<string, unknown>): void;
}): MessageHandler {
  const pageEvent = createPageEventHandler(host);
  return (message, sender, reply) => {
    if (host.sidePanelInstance(message, sender, reply)) return true;
    if (message?.type === "BROWSER_SETTINGS_UPDATED") {
      if (!isChatGptPageSender(sender, host.buildChannel, host.runtimeId))
        return false;
      Promise.allSettled(
        Array.from(host.controls(), (control) =>
          host.refreshBrowserSettings(control),
        ),
      ).then((results) =>
        reply({ ok: results.every((result) => result.status === "fulfilled") }),
      );
      return true;
    }
    if (host.sidePanelAuth(message, sender, reply)) return true;
    if (isAgentPopupRequest(message)) {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") return false;
      host
        .handleAgentBackgroundPopup(tabId, message.url)
        .then(() => reply({ ok: true }))
        .catch(() => reply({ ok: false }));
      return true;
    }
    if (pageEvent(message, sender)) return false;
    if (
      host.tabMentions(message, sender, reply) ||
      host.youtubeTimestamp(message, reply)
    )
      return true;
    if (host.showInstaller(message, sender)) {
      reply({ ok: true });
      return false;
    }
    if (host.sidePanelLoad(message, sender, reply)) return true;
    if (host.openSidePanel(message, sender)) {
      reply({ ok: true });
      return false;
    }
    return host.cursor(message, sender, reply);
  };
}
