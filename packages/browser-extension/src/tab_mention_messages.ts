import { parseMentionQuery, type MentionCandidate } from "./tab_mentions";
export const TAB_MENTION_SEARCH = "search_browser_tab_mentions";
export const TAB_MENTIONS_INVALIDATED = "browser_tab_mentions_invalidated";
/** Original Nc/_s, including arbitrary HTTP loopback ports outside production. */
export function isChatGptOrigin(url: URL, channel: string) {
  const origins =
    channel === "prod"
      ? ["https://chatgpt.com"]
      : [
          "https://chatgpt.com",
          "https://chatgpt-staging.com",
          "http://localhost",
          "http://127.0.0.1",
        ];
  return (
    origins.includes(url.origin) ||
    (channel !== "prod" &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
  );
}
export function isChatGptPageSender(
  sender: chrome.runtime.MessageSender,
  channel: string,
  runtimeId: string,
) {
  if (
    sender.id !== runtimeId ||
    sender.frameId !== 0 ||
    (sender.documentLifecycle != null &&
      sender.documentLifecycle !== "active") ||
    typeof sender.origin !== "string" ||
    typeof sender.url !== "string" ||
    typeof sender.tab?.id !== "number" ||
    typeof sender.tab.windowId !== "number"
  )
    return false;
  let url: URL;
  try {
    url = new URL(sender.url);
  } catch {
    return false;
  }
  return sender.origin === url.origin && isChatGptOrigin(url, channel);
}
/** Original If also accepts authenticated extension senders with no tab. */
export function isTabMentionSender(
  sender: chrome.runtime.MessageSender,
  channel: string,
  runtimeId: string,
) {
  if (isChatGptPageSender(sender, channel, runtimeId)) return true;
  if (
    sender.id !== runtimeId ||
    sender.tab != null ||
    (sender.documentLifecycle != null &&
      sender.documentLifecycle !== "active") ||
    typeof sender.url !== "string" ||
    typeof sender.origin !== "string"
  )
    return false;
  try {
    const url = new URL(sender.url);
    return sender.origin === url.origin && isChatGptOrigin(url, channel);
  } catch {
    return false;
  }
}
interface MentionProvider {
  getUserTabs(query: {
    includeFavicons: boolean;
    query: string;
    limit: number;
  }): Promise<MentionCandidate[]>;
  subscribeCandidateUpdates(
    candidates: MentionCandidate[],
    listener: (candidates: MentionCandidate[]) => void,
  ): () => void;
}
export type MentionSearchReply =
  { ok: true; candidates: MentionCandidate[] } | { ok: false; error: string };
function ownMessage(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value != null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
/** Original Tf/KC. Only the first port message starts a search; later messages are ignored. */
export function createTabMentionMessageRouter(
  provider: MentionProvider,
  channel: string,
  runtime: Pick<typeof chrome.runtime, "id">,
) {
  function handleMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    reply: (response: MentionSearchReply) => void,
  ) {
    if (ownMessage(message)?.type !== TAB_MENTION_SEARCH) return false;
    if (!(
      sender.tab?.incognito !== true &&
      isTabMentionSender(sender, channel, runtime.id)
    )) {
      reply({
        ok: false,
        error: "Chrome tab mentions can only be accessed from ChatGPT",
      });
      return true;
    }
    const input = ownMessage(message)!;
    const query = parseMentionQuery({ query: input.query, limit: input.limit });
    if (
      query == null ||
      !Object.keys(input).every((key) =>
        ["type", "query", "limit"].includes(key),
      )
    ) {
      reply({ ok: false, error: "Invalid Chrome tab mention search" });
      return true;
    }
    const senderTabId = sender.tab?.id;
    const limit = Math.min(
      query.limit + (senderTabId != null && query.limit > 0 ? 1 : 0),
      100,
    );
    provider
      .getUserTabs({ includeFavicons: true, query: query.query, limit })
      .then((candidates) =>
        reply({
          ok: true,
          candidates: candidates
            .filter(({ id }) => id !== senderTabId)
            .slice(0, query.limit),
        }),
      )
      .catch((error) =>
        reply({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }
  function handleConnect(port: chrome.runtime.Port) {
    if (port.name !== TAB_MENTION_SEARCH) return;
    if (
      port.sender == null ||
      port.sender.tab?.incognito === true ||
      !isTabMentionSender(port.sender, channel, runtime.id)
    ) {
      port.disconnect();
      return;
    }
    const sender = port.sender;
    let closed = false;
    let unsubscribe: (() => void) | undefined;
    const cleanup = () => {
      if (!closed) {
        closed = true;
        unsubscribe?.();
        port.onMessage.removeListener(onMessage);
      }
    };
    const post = (response: MentionSearchReply) => {
      if (closed) return false;
      try {
        port.postMessage(response);
        return true;
      } catch {
        cleanup();
        return false;
      }
    };
    const onMessage = (message: unknown) => {
      if (closed) return;
      port.onMessage.removeListener(onMessage);
      handleMessage(message, sender, (response) => {
        if (post(response) && response.ok)
          unsubscribe = provider.subscribeCandidateUpdates(
            response.candidates,
            (candidates) => {
              post({ ok: true, candidates });
            },
          );
      });
    };
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(cleanup);
  }
  return { handleMessage, handleConnect };
}
/** Original hR; peer and runtime failures retain their original handling. */
export function sendTabMentionsInvalidated(
  peer: { sendBrowserTabMentionsInvalidated(): void },
  runtime: Pick<typeof chrome.runtime, "sendMessage">,
) {
  peer.sendBrowserTabMentionsInvalidated();
  runtime.sendMessage({ type: TAB_MENTIONS_INVALIDATED }).catch(() => {});
}
