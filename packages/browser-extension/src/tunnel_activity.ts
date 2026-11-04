export interface TunnelListeningState {
  listening: boolean;
  uncertain: boolean;
  activeTurns: string[];
  lastTurnEndedAt: number | null;
}
const stateKey = "browserUseTunnelListening",
  panelKey = "codexSidePanelOpenWindowIds";
/** Original y_. Extra fields and inherited fields are deliberately retained. */
export function isTunnelListeningState(
  value: any,
): value is TunnelListeningState {
  return (
    value != null &&
    typeof value === "object" &&
    "listening" in value &&
    typeof value.listening === "boolean" &&
    "uncertain" in value &&
    typeof value.uncertain === "boolean" &&
    (!value.uncertain || value.listening) &&
    "activeTurns" in value &&
    Array.isArray(value.activeTurns) &&
    value.activeTurns.every(
      (turn: unknown) => typeof turn === "string" && turn.length > 0,
    ) &&
    (value.listening || value.activeTurns.length === 0) &&
    "lastTurnEndedAt" in value &&
    (value.lastTurnEndedAt === null ||
      (typeof value.lastTurnEndedAt === "number" &&
        value.lastTurnEndedAt >= 0 &&
        Number.isFinite(value.lastTurnEndedAt)))
  );
}
/** Original xl/b_. This observation heuristic is not a browser permission gate. */
export function isTunnelActivityTab(
  tab: { url?: string; pendingUrl?: string },
  chatOrigin = "https://chatgpt.com",
) {
  const hosts = [
    "chatgpt.com",
    "chat.com",
    "openai.com",
    "openai.org",
    "chatgpt-staging.com",
    "openai-staging.com",
    new URL(chatOrigin).hostname,
  ];
  return [tab.url, tab.pendingUrl].some((value) => {
    if (value == null) return false;
    try {
      const { hostname } = new URL(value);
      return hosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      );
    } catch {
      return false;
    }
  });
}
/** Original w_: persisted listening, uncertainty fail-open and stale-read suppression. */
export async function createTunnelActivity(
  host: {
    chrome: Pick<typeof chrome, "tabs" | "runtime" | "storage"> &
      Partial<Pick<typeof chrome, "sidePanel">>;
    now(): number;
    chatOrigin?: string;
    reportIdle(): void;
  },
  onListening: (listening: boolean) => void,
) {
  const browser = host.chrome;
  let state: TunnelListeningState = {
    listening: false,
    uncertain: false,
    activeTurns: [],
    lastTurnEndedAt: null,
  };
  let stopped = false,
    generation = 0,
    emitted: boolean | undefined;
  let writes = Promise.resolve();
  const emit = () => {
    if (stopped || emitted === state.listening) return;
    const disabled = emitted === true && !state.listening;
    emitted = state.listening;
    onListening(state.listening);
    if (disabled)
      try {
        host.reportIdle();
      } catch {}
  };
  const markUncertain = () => {
    if (!state.uncertain)
      update({
        ...state,
        listening: true,
        uncertain: true,
        lastTurnEndedAt: null,
      });
    emit();
  };
  const update = (next: TunnelListeningState) => {
    if (stopped) return;
    state = next;
    generation++;
    writes = writes.then(async () => {
      if (stopped) return;
      const saved = state;
      try {
        await browser.storage.session.set({ [stateKey]: saved });
      } catch {
        markUncertain();
      }
      if (state === saved) emit();
    });
  };
  const activate = () => {
    generation++;
    if (!state.listening)
      update({ ...state, listening: true, lastTurnEndedAt: null });
  };
  const isActive = (tab: { url?: string; pendingUrl?: string }) =>
    isTunnelActivityTab(tab, host.chatOrigin);
  const refresh = async () => {
    if (stopped) return;
    const current = ++generation;
    try {
      const [tabs, panels, stored] = await Promise.all([
        browser.tabs.query({}),
        browser.runtime.getContexts({
          contextTypes: ["SIDE_PANEL" as chrome.runtime.ContextType],
        }),
        browser.storage.session.get(panelKey),
      ]);
      if (stopped || generation !== current) return;
      const open = stored[panelKey];
      if (
        open !== undefined &&
        (!Array.isArray(open) ||
          !open.every((value) => Number.isSafeInteger(value)))
      )
        throw new Error("Invalid side panel state");
      if (
        tabs.some(isActive) ||
        panels.length > 0 ||
        (Array.isArray(open) && open.length > 0)
      )
        activate();
      else if (
        !state.uncertain &&
        state.listening &&
        state.activeTurns.length === 0 &&
        state.lastTurnEndedAt != null &&
        host.now() - state.lastTurnEndedAt >= 600000
      )
        update({ ...state, listening: false });
      await writes;
    } catch {
      if (!stopped) markUncertain();
    }
  };
  const changed = () => {
    refresh();
  };
  const created = (tab: chrome.tabs.Tab) => {
    if (isActive(tab)) activate();
    changed();
  };
  const updated = (
    _id: number,
    _change: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab,
  ) => created(tab);
  const storageChanged = (changes: Record<string, unknown>, area: string) => {
    if (area === "session" && panelKey in changes) changed();
  };
  try {
    const saved = (await browser.storage.session.get(stateKey))[stateKey];
    if (saved !== undefined) {
      if (!isTunnelListeningState(saved))
        throw new Error("Invalid listening state");
      state = saved;
    }
  } catch {
    markUncertain();
  }
  browser.tabs.onCreated.addListener(created);
  browser.tabs.onUpdated.addListener(updated);
  browser.tabs.onRemoved.addListener(changed);
  browser.storage.onChanged.addListener(storageChanged);
  browser.sidePanel?.onOpened?.addListener(activate);
  await refresh();
  if (emitted === undefined) update(state);
  await writes;
  return {
    turnStarted(turn: string) {
      if (!state.activeTurns.includes(turn))
        update({
          ...state,
          listening: true,
          activeTurns: [...state.activeTurns, turn],
        });
    },
    turnEnded(turn: string) {
      update({
        ...state,
        activeTurns: state.activeTurns.filter((value) => value !== turn),
        lastTurnEndedAt: host.now(),
      });
    },
    refresh,
    stop() {
      stopped = true;
      generation++;
      browser.tabs.onCreated.removeListener(created);
      browser.tabs.onUpdated.removeListener(updated);
      browser.tabs.onRemoved.removeListener(changed);
      browser.storage.onChanged.removeListener(storageChanged);
      browser.sidePanel?.onOpened?.removeListener(activate);
    },
  };
}
