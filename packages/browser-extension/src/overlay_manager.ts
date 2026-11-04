import { createContentRuntime } from "./content_runtime";
import type { CursorState, OverlayState } from "./overlay_controller";
interface OverlaySession {
  tabIds: Set<number>;
  isRunning: boolean;
  currentTurnId: string | null;
  cursorByTabId: Map<number, CursorState>;
  activeRequests: number;
  abortController: AbortController | null;
}
const emptyOverlayState: OverlayState = {
  cursor: null,
  isVisible: false,
  sessionId: null,
  turnId: null,
};
class OverlayCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasCommandError";
  }
}
/** Original aS/Hu/nS/sS. Use a shared content runtime with other background services. */
export function createOverlayManagerClass(host: {
  chrome: typeof chrome;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  contentRuntime?: ReturnType<typeof createContentRuntime>;
}) {
  const content = host.contentRuntime ?? createContentRuntime(host);
  return class OverlayManager {
    sessions = new Map<string, OverlaySession>();
    tabSessions = new Map<number, Set<string>>();
    observedTabs: { isObserved(tabId: number): boolean };
    onBrowserControlActivityChanged: (active: boolean) => void;
    lastBrowserControlActive = false;
    constructor(
      options: {
        observedTabs?: { isObserved(tabId: number): boolean };
        onBrowserControlActivityChanged?(active: boolean): void;
      } = {},
    ) {
      this.observedTabs = options.observedTabs ?? { isObserved: () => false };
      this.onBrowserControlActivityChanged =
        options.onBrowserControlActivityChanged ?? (() => {});
    }
    async startSession(
      sessionId: string,
      turnId: string | null = null,
      options: { publishTabs?: boolean } = {},
    ) {
      const session = this.ensureSession(sessionId);
      if (turnId != null && session.currentTurnId !== turnId)
        session.cursorByTabId.clear();
      session.currentTurnId = turnId ?? session.currentTurnId;
      session.isRunning = true;
      if (options.publishTabs !== false)
        await this.publishSessionTabs(sessionId);
      this.updateBrowserControlActivity();
    }
    async finishSession(sessionId: string) {
      const session = this.sessions.get(sessionId);
      if (session) {
        await this.publishTabs(this.detachSession(sessionId, session));
        this.updateBrowserControlActivity();
      }
    }
    isBrowserControlActive() {
      for (const session of this.sessions.values())
        if (session.isRunning || session.activeRequests > 0) return true;
      return false;
    }
    setBrowserControlActivityChangeHandler(handler: (active: boolean) => void) {
      this.onBrowserControlActivityChanged = handler;
      this.updateBrowserControlActivity();
    }
    requireRunningSession(sessionId: string) {
      if (!this.sessions.get(sessionId)?.isRunning) {
        throw new OverlayCommandError(
          "Codex is not running for this browser session.",
        );
      }
    }
    throwIfAgentNotRunning(sessionId: string) {
      this.requireRunningSession(sessionId);
    }
    async trackTab(
      sessionId: string,
      tabId: number,
      options: { publish?: boolean } = {},
    ) {
      this.linkTabToSession(sessionId, tabId);
      if (options.publish !== false) await this.publishTabState(tabId);
    }
    async untrackTab(sessionId: string, tabId: number) {
      const session = this.sessions.get(sessionId);
      session?.tabIds.delete(tabId);
      session?.cursorByTabId.delete(tabId);
      if (session?.tabIds.size === 0) this.sessions.delete(sessionId);
      const sessions = this.tabSessions.get(tabId);
      if (sessions) {
        sessions.delete(sessionId);
        if (sessions.size === 0) this.tabSessions.delete(tabId);
      }
      await this.publishTabState(tabId);
      this.updateBrowserControlActivity();
    }
    async startRequest(sessionId: string, tabId: number) {
      this.throwIfAgentNotRunning(sessionId);
      const session = this.linkTabToSession(sessionId, tabId);
      session.activeRequests += 1;
      if (!session.abortController || session.abortController.signal.aborted)
        session.abortController = new AbortController();
      await this.publishSessionTabs(sessionId);
      this.updateBrowserControlActivity();
      return session.abortController.signal;
    }
    async finishRequest(sessionId: string) {
      const session = this.sessions.get(sessionId);
      if (!session) return;
      session.activeRequests = Math.max(0, session.activeRequests - 1);
      if (session.activeRequests === 0) session.abortController = null;
      await this.publishSessionTabs(sessionId);
      this.updateBrowserControlActivity();
    }
    async stopActiveSessions() {
      const ids = Array.from(this.sessions.entries())
        .filter(([, session]) => session.isRunning)
        .map(([id]) => id);
      await this.stopSessions(ids);
      return ids;
    }
    async stopSessions(ids: Iterable<string>) {
      for (const id of ids) await this.stopSession(id);
    }
    async setCursorState(
      sessionId: string,
      tabId: number,
      turnId: string,
      cursor: CursorState,
      options: { publish?: boolean } = {},
    ) {
      const session = this.sessions.get(sessionId);
      if (!session?.isRunning) return false;
      session.currentTurnId = turnId;
      session.cursorByTabId.set(tabId, cursor);
      if (options.publish === false) return false;
      return await this.publishTabCursorState(tabId);
    }
    isObserved(tabId: number) {
      return this.observedTabs.isObserved(tabId);
    }
    readCursorOverlayState(tabId: number): OverlayState {
      const id = this.getHighestPrioritySessionIdForTab(tabId);
      if (id == null) return emptyOverlayState;
      const session = this.sessions.get(id);
      if (!session?.isRunning) return emptyOverlayState;
      const cursor = session.cursorByTabId.get(tabId) ?? null,
        observed = this.observedTabs.isObserved(tabId);
      return {
        cursor:
          !observed && cursor != null
            ? { visible: false, x: cursor.x, y: cursor.y }
            : cursor,
        isVisible: observed,
        sessionId: id,
        turnId: session.currentTurnId,
      };
    }
    async republishTabState(tabId: number) {
      await this.publishTabState(tabId);
    }
    async republishTabStates(ids: Iterable<number>) {
      await this.publishTabs(ids);
    }
    async stopSession(sessionId: string) {
      const session = this.sessions.get(sessionId);
      if (!session?.isRunning) return;
      session.isRunning = false;
      session.abortController?.abort();
      await this.publishSessionTabs(sessionId);
      this.updateBrowserControlActivity();
    }
    ensureSession(sessionId: string): OverlaySession {
      let session = this.sessions.get(sessionId);
      if (!session) {
        session = {
          tabIds: new Set(),
          isRunning: false,
          currentTurnId: null,
          cursorByTabId: new Map(),
          activeRequests: 0,
          abortController: null,
        };
        this.sessions.set(sessionId, session);
      }
      return session;
    }
    linkTabToSession(sessionId: string, tabId: number) {
      const session = this.ensureSession(sessionId);
      session.tabIds.add(tabId);
      this.attachTabSession(tabId, sessionId);
      return session;
    }
    attachTabSession(tabId: number, sessionId: string) {
      const sessions = this.tabSessions.get(tabId);
      if (sessions) {
        sessions.add(sessionId);
        return;
      }
      this.tabSessions.set(tabId, new Set([sessionId]));
    }
    detachSession(sessionId: string, session: OverlaySession) {
      const ids = Array.from(session.tabIds);
      this.sessions.delete(sessionId);
      for (const tabId of ids) {
        const sessions = this.tabSessions.get(tabId);
        if (sessions) {
          sessions.delete(sessionId);
          if (sessions.size === 0) this.tabSessions.delete(tabId);
        }
      }
      return ids;
    }
    async publishSessionTabs(sessionId: string) {
      const session = this.sessions.get(sessionId);
      if (session) await this.publishTabs(session.tabIds);
    }
    async publishTabs(ids: Iterable<number>) {
      await Promise.all(
        Array.from(ids, async (tabId) => this.publishTabState(tabId)),
      );
    }
    async publishTabState(tabId: number) {
      await this.publishTabCursorState(tabId);
    }
    async publishTabCursorState(tabId: number) {
      if (!(await this.prepareContentScript(tabId))) return false;
      const message = {
        type: "AGENT_CURSOR_STATE",
        state: this.readCursorOverlayState(tabId),
      };
      try {
        return (
          (
            await content.withTimeout(
              host.chrome.tabs.sendMessage(tabId, message),
            )
          )?.ok === true
        );
      } catch {
        return false;
      }
    }
    async prepareContentScript(tabId: number) {
      return this.tabSessions.has(tabId)
        ? await content.ensureContentScript(tabId)
        : await content.ping(tabId);
    }
    getHighestPrioritySessionIdForTab(tabId: number) {
      const sessions = this.tabSessions.get(tabId);
      if (!sessions || sessions.size === 0) return null;
      for (const id of sessions)
        if (this.sessions.get(id)?.isRunning) return id;
      return null;
    }
    updateBrowserControlActivity() {
      const active = this.isBrowserControlActive();
      if (active !== this.lastBrowserControlActive) {
        this.lastBrowserControlActive = active;
        this.onBrowserControlActivityChanged(active);
      }
    }
  };
}
/** Original fR: keep sender-tab and message shape validation before resolving waiters. */
export function createCursorMessageHandler(
  overlay: { readCursorOverlayState(tabId: number): OverlayState },
  handler: {
    notifyCursorArrived(value: {
      moveSequence: number;
      sessionId: string;
      turnId: string;
    }): void;
  },
) {
  return (
    message: any,
    sender: chrome.runtime.MessageSender,
    reply: (value: any) => void,
  ): boolean => {
    const tabId = sender.tab?.id;
    switch (message?.type) {
      case "GET_AGENT_CURSOR_STATE":
        reply({
          ok: true,
          state: overlay.readCursorOverlayState(
            typeof tabId === "number" ? tabId : -1,
          ),
        });
        return true;
      case "AGENT_CURSOR_ARRIVED":
        if (
          typeof tabId !== "number" ||
          !("sessionId" in message) ||
          !("turnId" in message) ||
          !("moveSequence" in message) ||
          typeof message.sessionId !== "string" ||
          typeof message.turnId !== "string" ||
          !Number.isInteger(message.moveSequence)
        ) {
          reply({ ok: false });
          return true;
        }
        handler.notifyCursorArrived({
          moveSequence: message.moveSequence,
          sessionId: message.sessionId,
          turnId: message.turnId,
        });
        reply({ ok: true });
        return true;
      default:
        return false;
    }
  };
}
