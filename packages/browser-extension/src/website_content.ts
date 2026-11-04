import {
  installMentionSearchContent,
  type MentionContentContext,
} from "./side_chat_mentions";
interface WebsiteContext extends MentionContentContext {
  readonly isValid: boolean;
}
interface WebsiteHost {
  window: Window;
  document: Document;
  navigator: Navigator;
  chrome: Pick<typeof chrome, "runtime" | "extension">;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}
const statusAttribute = "data-chatgpt-extension-status";
const statusEvent = "chatgpt-extension-status";
const panelAttribute = "data-chatgpt-extension-side-panel";
/** Original oe: refresh requests permit one reconnect, rather than an infinite retry loop. */
export function createWebsiteStatusConnection(
  context: MentionContentContext,
  host: WebsiteHost,
) {
  const runtime = host.chrome.runtime;
  let status: any;
  let port: chrome.runtime.Port | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshRequested = false;
  let stopped = false;
  let observer: MutationObserver | undefined;
  const publish = () => {
    const root = host.document.documentElement;
    if (root == null || stopped) return;
    observer?.disconnect();
    root.setAttribute(panelAttribute, "available");
    if (status != null) {
      root.setAttribute(statusAttribute, JSON.stringify(status));
      host.window.dispatchEvent(new Event(statusEvent));
    }
  };
  if (host.document.documentElement == null) {
    observer = new MutationObserver(publish);
    observer.observe(host.document, { childList: true });
  } else publish();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    host.clearTimeout(timer);
    observer?.disconnect();
    disconnect();
    status = undefined;
    host.document.documentElement?.removeAttribute(statusAttribute);
    host.document.documentElement?.removeAttribute(panelAttribute);
    host.window.dispatchEvent(new Event(statusEvent));
  };
  const reconnect = () => {
    if (runtime.id == null) {
      stop();
      return;
    }
    if (refreshRequested && !stopped) {
      refreshRequested = false;
      timer = host.setTimeout(() => {
        timer = undefined;
        connect();
      }, 250);
    }
  };
  const onMessage = (message: any, source: chrome.runtime.Port) => {
    if (port !== source || stopped) return;
    status = {
      ...message.status,
      browserContext: message.status.browserContext ?? status?.browserContext,
    };
    publish();
  };
  const disconnect = () => {
    const previous = port;
    if (previous != null) {
      port = undefined;
      previous.onMessage.removeListener(onMessage);
      previous.onDisconnect.removeListener(onDisconnect);
      previous.disconnect();
    }
  };
  const onDisconnect = (source: chrome.runtime.Port) => {
    runtime.lastError;
    if (port === source) {
      disconnect();
      reconnect();
    }
  };
  const connect = () => {
    try {
      port = runtime.connect({ name: "chatgpt-extension-status" });
    } catch {
      reconnect();
      return;
    }
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  };
  context.onInvalidated(stop);
  return () => {
    if (stopped) return;
    host.clearTimeout(timer);
    timer = undefined;
    refreshRequested = true;
    if (port == null) connect();
    else
      try {
        port.postMessage({ type: "refresh" });
      } catch {
        onDisconnect(port);
      }
  };
}
/** Original ie: walk composedPath, preserving trusted/defaultPrevented checks. */
export function handleWebsiteActionClick(
  event: MouseEvent,
  runtime: Pick<typeof chrome.runtime, "sendMessage">,
) {
  if (!event.isTrusted || event.defaultPrevented) return;
  for (const element of event.composedPath()) {
    if (!(element instanceof Element)) continue;
    let message: any;
    switch (element.getAttribute("data-chatgpt-extension-action")) {
      case "show-codex-installer":
        message = { type: "SHOW_CODEX_INSTALLER" };
        break;
      case "open-side-panel": {
        const prompt = element.getAttribute("data-chatgpt-extension-prompt");
        message = {
          type: "OPEN_CODEX_SIDE_PANEL",
          source: "chatgpt_website_onboarding",
          ...(prompt == null ? {} : { prompt }),
        };
        break;
      }
      default:
        continue;
    }
    event.preventDefault();
    runtime.sendMessage(message).catch(() => {});
    return;
  }
}
/** Original se. Unknown fields are ignored; specified mode must be work. */
export function handleWebsiteActionRequest(
  event: Event,
  host: Pick<WebsiteHost, "navigator" | "chrome">,
) {
  if (
    !(event instanceof CustomEvent) ||
    !event.cancelable ||
    event.defaultPrevented ||
    host.navigator.userActivation?.isActive !== true
  )
    return;
  const detail = event.detail;
  if (typeof detail !== "object" || detail == null || !("type" in detail))
    return;
  let message: any;
  switch (detail.type) {
    case "OPEN_CODEX_SIDE_PANEL": {
      const prompt = "prompt" in detail ? detail.prompt : undefined;
      if (prompt !== undefined && typeof prompt !== "string") return;
      const source = "source" in detail ? detail.source : undefined;
      if (source !== undefined && typeof source !== "string") return;
      const mode = "mode" in detail ? detail.mode : undefined;
      if (mode !== undefined && mode !== "work") return;
      message = { type: "OPEN_CODEX_SIDE_PANEL", mode, prompt, source };
      break;
    }
    case "SHOW_CODEX_INSTALLER":
      message = { type: "SHOW_CODEX_INSTALLER" };
      break;
    default:
      return;
  }
  event.preventDefault();
  host.chrome.runtime.sendMessage(message).catch(() => {});
}
/** Original re. WXT owns DOM listener cleanup; runtime listener is removed explicitly. */
export function installWebsiteContent(
  context: WebsiteContext,
  host: WebsiteHost,
) {
  const runtime = host.chrome.runtime;
  installMentionSearchContent(context, host);
  const refresh = createWebsiteStatusConnection(context, host);
  const onMessage = (
    message: any,
    sender: chrome.runtime.MessageSender,
    reply: (response: any) => void,
  ) => {
    if (
      !context.isValid ||
      sender.id !== runtime.id ||
      typeof message !== "object" ||
      message == null ||
      !("type" in message)
    )
      return;
    switch (message.type) {
      case "CHATGPT_WEBSITE_BRIDGE_PING":
        reply({ version: runtime.getManifest().version });
        break;
      case "CHATGPT_WEBSITE_PLUGINS_CHANGED":
        host.window.dispatchEvent(
          new Event("chatgpt-extension-plugins-changed"),
        );
        break;
    }
  };
  runtime.onMessage.addListener(onMessage);
  context.onInvalidated(() => runtime.onMessage.removeListener(onMessage));
  context.addEventListener(
    host.document,
    "click",
    (event) => handleWebsiteActionClick(event, runtime),
    { capture: true },
  );
  context.addEventListener(
    host.window,
    "chatgpt-extension-request-status",
    refresh,
  );
  context.addEventListener(
    host.window,
    "chatgpt-extension-settings-updated",
    () => {
      runtime.sendMessage({ type: "BROWSER_SETTINGS_UPDATED" }).catch(() => {});
    },
  );
  context.addEventListener(
    host.window,
    "chatgpt-extension-request-action",
    (event) => handleWebsiteActionRequest(event, host),
  );
  refresh();
}
