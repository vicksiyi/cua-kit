import { parseChatAccount } from "./siwc";
export interface TunnelConfiguration {
  account: { userId: string; id: string; structure: string };
  apiKey: string;
  baseUrl: string;
  tunnelId: string;
}
export interface TunnelPoller {
  suspend(): void;
  dispose(): void;
  initialize(): Promise<void>;
  ensurePolling(): Promise<void>;
  setListening(value: boolean): void;
}
export interface TunnelPollingHost<Config> {
  readConfiguration(): Promise<Config | null>;
  storageChanges: {
    addListener(listener: (changes: Record<string, unknown>, area: string) => void): void;
    removeListener(listener: (changes: Record<string, unknown>, area: string) => void): void;
  };
  createPoller(config: Config, onInvalid: (reason: string) => unknown,
    onUnauthorized: (retry: unknown) => Promise<boolean>): TunnelPoller;
  warn(message: string): void;
}
/** Original E_: owns poller identity and invalidates stale asynchronous refresh/recovery work. */
export async function createTunnelPollingManager<Config>(
  host: TunnelPollingHost<Config>,
  onInvalid?: (config: Config, reason: string) => unknown,
  suspended = false,
  onUnauthorized?: (config: Config, retry: unknown) => Promise<boolean | undefined>,
) {
  let poller: TunnelPoller | null = null;
  let generation = 0;
  let appliedGeneration = 0;
  let config: Config | null = null;
  let stopped = false;
  let listening = true;
  const refresh = async () => {
    const current = ++generation;
    if (stopped || suspended) return;
    poller?.suspend();
    const next = await host.readConfiguration();
    if (current !== generation) return;
    appliedGeneration = current;
    if (poller != null && JSON.stringify(next) === JSON.stringify(config)) {
      await poller.initialize();
      return;
    }
    poller?.dispose();
    poller = null;
    config = next;
    if (next == null) return;
    const created = host.createPoller(next,
      reason => {
        if (poller === created && !suspended && !stopped) return onInvalid?.(next, reason);
      },
      async retry => poller !== created || suspended || stopped || appliedGeneration !== generation
        ? false : ((await onUnauthorized?.(next, retry)) ?? false));
    poller = created;
    created.setListening(listening);
    await created.initialize();
  };
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === "session" && "nodeReplTunnel" in changes)
      refresh().catch(() => host.warn("[node-repl-tunnel] failed to update tunnel polling"));
  };
  host.storageChanges.addListener(changed);
  await refresh();
  const ensurePolling = async () => {
    if (!stopped && !suspended && appliedGeneration === generation) await poller?.ensurePolling();
  };
  return {
    ensurePolling,
    async setListening(value: boolean) {
      listening = value;
      poller?.setListening(value);
      await ensurePolling();
    },
    stop() {
      stopped = true;
      generation++;
      poller?.dispose();
      poller = null;
      host.storageChanges.removeListener(changed);
    },
    suspend() {
      suspended = true;
      generation++;
      poller?.suspend();
    },
    async resume() { suspended = false; await refresh(); },
  };
}

/** Original Hn: storage errors propagate; malformed stored values return null. */
export async function readTunnelConfiguration(storage: {
  get(key: string): Promise<Record<string, any>>;
}): Promise<TunnelConfiguration | null> {
  const values = await storage.get("nodeReplTunnel");
  try {
    const value = values.nodeReplTunnel;
    if (typeof value.baseUrl !== "string" || !value.apiKey.trim() || !value.tunnelId.trim()) return null;
    return {
      account: parseChatAccount(value.account, value.account.userId),
      apiKey: value.apiKey,
      baseUrl: value.baseUrl,
      tunnelId: value.tunnelId,
    };
  } catch { return null; }
}
