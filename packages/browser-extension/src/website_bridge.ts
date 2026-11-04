import { isChatGptOrigin } from "./tab_mention_messages";
import type { createContentRuntime } from "./content_runtime";
/** Original pm: query patterns intentionally omit arbitrary loopback ports. */
export function websiteTabPatterns(channel: string) {
  return (
    channel === "prod"
      ? ["https://chatgpt.com"]
      : [
          "https://chatgpt.com",
          "https://chatgpt-staging.com",
          "http://localhost",
          "http://127.0.0.1",
        ]
  ).map((origin) => `${origin}/*`);
}
/** Original Cf/nk/Do. Concurrent refreshes share a document handshake, not notifications. */
export function createWebsiteBridge(host: {
  chrome: Pick<
    typeof chrome,
    "tabs" | "webNavigation" | "runtime" | "scripting"
  >;
  withTimeout: ReturnType<typeof createContentRuntime>["withTimeout"];
  reportFailure(
    name: string,
    value: number,
    tags: Record<string, string>,
  ): void;
}) {
  const pending = new Map<string, Promise<boolean>>();
  async function ensure(tabId: number, documentId: string) {
    async function ping() {
      const reply = await host
        .withTimeout(
          host.chrome.tabs.sendMessage(
            tabId,
            { type: "CHATGPT_WEBSITE_BRIDGE_PING" },
            { documentId },
          ),
        )
        .catch(() => null);
      return (
        typeof reply === "object" &&
        reply != null &&
        "version" in reply &&
        reply.version === host.chrome.runtime.getManifest().version
      );
    }
    if (await ping()) return true;
    const injected = await host
      .withTimeout(
        host.chrome.scripting.executeScript({
          files: ["content-scripts/chatgpt-website.js"],
          target: { tabId, documentIds: [documentId] },
        }),
      )
      .catch(() => null);
    if (injected != null && (await ping())) return true;
    host.chrome.webNavigation
      .getFrame({ tabId, frameId: 0 })
      .then((frame) => {
        if (
          frame?.documentId === documentId &&
          frame.documentLifecycle === "active"
        )
          host.reportFailure(
            "codex_chrome_extension_browser_context_setup_failure",
            1,
            {
              surface: "website",
              stage: injected == null ? "injection" : "handshake",
            },
          );
      })
      .catch(() => {});
    return false;
  }
  async function refresh(channel: string, notify: boolean) {
    const tabs = await host.chrome.tabs.query({
      url: websiteTabPatterns(channel),
    });
    await Promise.allSettled(
      tabs.map(async (tab) => {
        if (tab.id == null || tab.discarded) return;
        const tabId = tab.id;
        const frame = await host.chrome.webNavigation.getFrame({
          tabId,
          frameId: 0,
        });
        if (
          frame == null ||
          frame.documentLifecycle !== "active" ||
          !isChatGptOrigin(new URL(frame.url), channel)
        )
          return;
        const { documentId } = frame;
        let handshake = pending.get(documentId);
        if (handshake == null) {
          handshake = ensure(tabId, documentId).finally(() => {
            pending.delete(documentId);
          });
          pending.set(documentId, handshake);
        }
        if ((await handshake) && notify)
          await host.chrome.tabs.sendMessage(
            tabId,
            { type: "CHATGPT_WEBSITE_PLUGINS_CHANGED" },
            { documentId },
          );
      }),
    );
  }
  return { refresh };
}
