/** Original Wf/zk/Kf: registrations are temporary and retain separate JS worlds. */
export const webMcpContentScripts: chrome.scripting.RegisteredContentScript[] =
  [
    {
      matches: ["<all_urls>"],
      runAt: "document_start",
      world: "MAIN",
      id: "codex-webmcp",
      js: ["content-scripts/webmcp.js"],
      persistAcrossSessions: false,
    },
    {
      matches: ["<all_urls>"],
      runAt: "document_start",
      world: "ISOLATED",
      id: "codex-webmcp-bridge",
      js: ["content-scripts/webmcp-bridge.js"],
      persistAcrossSessions: false,
    },
  ];
/** Original Zf: only add missing registrations, remove only matching existing IDs. */
export function createWebMcpRegistration(
  scripting: Pick<
    typeof chrome.scripting,
    | "getRegisteredContentScripts"
    | "registerContentScripts"
    | "unregisterContentScripts"
  >,
) {
  return async (enabled: boolean) => {
    const registered = await scripting.getRegisteredContentScripts({
      ids: webMcpContentScripts.map(({ id }) => id),
    });
    if (!enabled) {
      if (registered.length > 0)
        await scripting.unregisterContentScripts({
          ids: registered.map(({ id }) => id),
        });
      return;
    }
    const ids = new Set(registered.map(({ id }) => id));
    const missing = webMcpContentScripts.filter(({ id }) => !ids.has(id));
    if (missing.length > 0) await scripting.registerContentScripts(missing);
  };
}
/** Original Wk: desired and successfully applied states remain distinct. */
export function createWebMcpGate(host: {
  subscribeGate(
    name: string,
    listener: (enabled: boolean) => void,
  ): Promise<unknown>;
  apply(enabled: boolean): Promise<unknown>;
  warn(message: string): void;
}) {
  let applied: boolean | undefined, desired: boolean | undefined;
  let queue = Promise.resolve();
  const enqueue = (enabled: boolean) => {
    desired = enabled;
    queue = queue.then(async () => {
      if (enabled !== desired || enabled === applied) return;
      applied = undefined;
      try {
        await host.apply(enabled);
        applied = enabled;
      } catch {
        try {
          await host.apply(false);
          applied = false;
        } catch {}
        host.warn("Failed to apply Chrome extension WebMCP gate.");
      }
    });
    return queue;
  };
  const subscribed = host
    .subscribeGate("codex-app-webmcp", (enabled) => {
      enqueue(enabled);
    })
    .catch(() => enqueue(false));
  return {
    async enabled() {
      await subscribed;
      let observed: Promise<void>;
      do {
        observed = queue;
        await observed;
      } while (observed !== queue);
      return desired === true && applied === true;
    },
  };
}
