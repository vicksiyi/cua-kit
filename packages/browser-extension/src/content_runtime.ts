/** Original Mu/Ta/_y/de and Ea: ping, deduplicated content-script injection and bounded waits. */
export function createContentRuntime(host: {
  chrome: typeof chrome;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}) {
  const pendingInjections = new Map<number, Promise<boolean>>();
  async function withTimeout<T>(
    operation: Promise<T>,
    timeoutMs = 1000,
  ): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = host.setTimeout(() => resolve(null), timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) host.clearTimeout(timer);
    }
  }
  async function ping(tabId: number): Promise<boolean> {
    try {
      return (
        (
          await withTimeout(
            host.chrome.tabs.sendMessage(tabId, { type: "CONTENT_PING" }),
          )
        )?.ok === true
      );
    } catch {
      return false;
    }
  }
  async function inject(tabId: number): Promise<boolean> {
    try {
      if (
        (await withTimeout(
          host.chrome.scripting.executeScript({
            files: ["content-scripts/codex.js"],
            injectImmediately: true,
            target: { tabId },
          }),
        )) == null
      )
        return false;
    } catch {
      return false;
    }
    return await ping(tabId);
  }
  async function ensureContentScript(tabId: number): Promise<boolean> {
    if (await ping(tabId)) return true;
    let pending = pendingInjections.get(tabId);
    if (!pending) {
      pending = inject(tabId);
      pendingInjections.set(tabId, pending);
      pending.finally(() => {
        pendingInjections.delete(tabId);
      });
    }
    return await pending;
  }
  return { ensureContentScript, withTimeout };
}
/** Original Gu/rS: identify our percent-encoded SVG badge, not arbitrary data URLs. */
export function isFaviconBadgeUrl(value: string | null | undefined): boolean {
  if (value == null || !value.startsWith("data:image/svg+xml,")) return false;
  try {
    return decodeURIComponent(value.slice(19)).includes(
      'data-codex-favicon-badge="codex-favicon-badge"',
    );
  } catch {
    return false;
  }
}
