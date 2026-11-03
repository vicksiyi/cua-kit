export interface SessionProvider {
  getCurrentSessionId(): string;
  getCurrentTurnId(): string | null | undefined;
}
export interface TabLifecycleEvent {
  type: "tab_created" | "tab_acquired";
  tabId: number;
  origin: string;
}
export interface TabSession {
  acquiredTabs: Map<number, string>;
  claimedTurnIds: Map<number, string>;
  pendingEvents: TabLifecycleEvent[];
}
/** Original Tg. Acquisitions are session scoped; claims are refreshed per turn. */
export class TabLifecycle {
  api: SessionProvider;
  sessions = new Map<string, TabSession>();
  constructor(api: SessionProvider) {
    this.api = api;
  }
  recordCreated(tabId: number) {
    const session = this.currentSession();
    session.acquiredTabs.set(tabId, "agent");
    const turnId = this.api.getCurrentTurnId();
    if (turnId != null) session.claimedTurnIds.set(tabId, turnId);
    session.pendingEvents.push({ type: "tab_created", tabId, origin: "agent" });
  }
  recordAcquired(tabId: number, origin = "external") {
    const session = this.currentSession(),
      turnId = this.api.getCurrentTurnId();
    if (turnId != null) session.claimedTurnIds.set(tabId, turnId);
    if (!session.acquiredTabs.has(tabId)) {
      session.acquiredTabs.set(tabId, origin);
      session.pendingEvents.push({ type: "tab_acquired", tabId, origin });
    }
  }
  needsReclaim(tabId: number) {
    const turnId = this.api.getCurrentTurnId();
    if (turnId == null) return false;
    const session = this.currentSession();
    return (
      session.acquiredTabs.has(tabId) &&
      session.claimedTurnIds.get(tabId) !== turnId
    );
  }
  takeEvents() {
    return this.currentSession().pendingEvents.splice(0);
  }
  currentSession() {
    const id = this.api.getCurrentSessionId();
    let session = this.sessions.get(id);
    if (session == null) {
      session = {
        acquiredTabs: new Map(),
        claimedTurnIds: new Map(),
        pendingEvents: [],
      };
      this.sessions.set(id, session);
    }
    return session;
  }
}
