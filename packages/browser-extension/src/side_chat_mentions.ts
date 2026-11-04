import { parseMentionQuery } from "./tab_mentions";
import { TAB_MENTION_SEARCH } from "./tab_mention_messages";
export interface MentionContentContext {
  addEventListener(
    target: EventTarget,
    type: string,
    listener: (event: any) => void,
    options?: AddEventListenerOptions,
  ): void;
  onInvalidated(listener: () => void): void;
}
interface MentionContentHost {
  window: Window;
  document: Document;
  chrome: Pick<typeof chrome, "runtime" | "extension">;
  now?: () => number;
}
const statusAttribute = "data-chatgpt-extension-status";
const statusEvent = "chatgpt-extension-status";
const searchCapability = "browserTabMentions.search";
/** Original U/L. The context-read capability may be absent but cannot be false. */
export function isSideChatCapabilities(value: any) {
  if (typeof value !== "object" || value == null) return false;
  const capabilities = value.capabilities;
  const context = value.browserContext;
  if (
    value.type !== "browser_side_chat_capabilities" ||
    typeof capabilities !== "object" ||
    capabilities == null ||
    Array.isArray(capabilities) ||
    typeof context !== "object" ||
    context == null ||
    Array.isArray(context) ||
    !(
      context.instanceId === null ||
      (typeof context.instanceId === "string" &&
        context.instanceId.length > 0 &&
        context.instanceId.length <= 128)
    )
  )
    return false;
  const contextRead = "browserSideChat.tabContext.read";
  return !(contextRead in capabilities) || capabilities[contextRead] === true;
}
/** Original u: the attribute exists only during synchronous event dispatch. */
export function publishMentionCandidates(
  host: Pick<MentionContentHost, "document" | "window">,
  candidates: unknown,
) {
  host.document.documentElement.setAttribute(
    "data-chatgpt-extension-browser-tabs",
    JSON.stringify(candidates),
  );
  try {
    host.window.dispatchEvent(new Event("chatgpt-extension-browser-tabs"));
  } finally {
    host.document.documentElement.removeAttribute(
      "data-chatgpt-extension-browser-tabs",
    );
  }
}
/** Original W: one search consumes the trusted-interaction allowance. */
export function installMentionSearchContent(
  context: MentionContentContext,
  host: MentionContentHost,
  enabled = () => true,
) {
  let allowedUntil = 0;
  let current: chrome.runtime.Port | null = null;
  const now = host.now ?? Date.now;
  const interacted = (event: Event) => {
    if (event.isTrusted) allowedUntil = now() + 5000;
  };
  const stop = () => {
    allowedUntil = 0;
    const port = current;
    current = null;
    port?.disconnect();
  };
  for (const type of [
    "click",
    "beforeinput",
    "paste",
    "pointerdown",
    "keydown",
  ])
    context.addEventListener(host.document, type, interacted, {
      capture: true,
    });
  context.onInvalidated(stop);
  context.addEventListener(host.window, "pagehide", stop);
  context.addEventListener(
    host.window,
    "chatgpt-extension-stop-browser-tabs",
    stop,
  );
  context.addEventListener(
    host.window,
    "chatgpt-extension-request-browser-tab-mentions",
    (event) => {
      if (!enabled()) return;
      const query = parseMentionQuery(
        event instanceof CustomEvent ? event.detail : undefined,
      );
      if (query == null || now() >= allowedUntil) return;
      stop();
      try {
        const port = host.chrome.runtime.connect({ name: TAB_MENTION_SEARCH });
        current = port;
        let received = false;
        port.onMessage.addListener((response) => {
          if (current === port) {
            received = true;
            publishMentionCandidates(
              host,
              response.ok ? response.candidates : [],
            );
          }
        });
        port.onDisconnect.addListener(() => {
          host.chrome.runtime.lastError;
          if (current === port) {
            current = null;
            if (!received) publishMentionCandidates(host, []);
          }
        });
        port.postMessage({ type: TAB_MENTION_SEARCH, ...query });
      } catch {
        stop();
        publishMentionCandidates(host, []);
      }
    },
  );
}
/** Original J.main: an extension-owned iframe must first receive trusted parent capabilities. */
export function installSideChatMentions(
  context: MentionContentContext,
  host: MentionContentHost,
) {
  const parentOrigin = `chrome-extension://${host.chrome.runtime.id}`;
  if (
    host.chrome.extension?.inIncognitoContext === true ||
    host.window.location.ancestorOrigins[0] !== parentOrigin
  )
    return;
  let enabled = false;
  installMentionSearchContent(context, host, () => enabled);
  const publishStatus = () => {
    host.document.documentElement?.setAttribute(
      statusAttribute,
      JSON.stringify({ capabilities: { [searchCapability]: true } }),
    );
    host.window.dispatchEvent(new Event(statusEvent));
  };
  const requestStatus = () => {
    if (enabled) {
      publishStatus();
      return;
    }
    host.window.parent.postMessage(
      { type: "browser_side_chat_capabilities_requested" },
      parentOrigin,
    );
  };
  context.addEventListener(host.window, "message", (event) => {
    if (
      enabled ||
      !event.isTrusted ||
      event.source !== host.window.parent ||
      event.origin !== parentOrigin ||
      !isSideChatCapabilities(event.data) ||
      event.data.capabilities[searchCapability] !== true
    )
      return;
    enabled = true;
    publishStatus();
  });
  context.addEventListener(
    host.window,
    "chatgpt-extension-request-status",
    requestStatus,
  );
  context.onInvalidated(() => {
    enabled = false;
    host.document.documentElement?.removeAttribute(statusAttribute);
    host.window.dispatchEvent(new Event(statusEvent));
  });
  requestStatus();
}
