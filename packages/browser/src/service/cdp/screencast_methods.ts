import type { CdpSourceEvent } from "./event_wait";
export interface InternalScreencast {
  sessionIds: Set<number>;
}
export interface ScreencastState {
  activeInternalScreencastsByTabId: Map<number, InternalScreencast>;
  screencastQueuesByTabId: Map<number, Promise<void>>;
  rawScreencastTabIds: Set<number>;
  retiredInternalScreencastSessionsByTabId: Map<
    number,
    Map<number, { expiresAt: number }>
  >;
}
export interface ScreencastOwner extends ScreencastState {
  withInternalScreencast<T>(
    tabId: unknown,
    run: (matches: (event: CdpSourceEvent) => boolean) => Promise<T>,
  ): Promise<T | undefined>;
  withScreencastLock<T>(tabId: number, run: () => Promise<T>): Promise<T>;
  isInternalScreencastEvent(tabId: number, event: CdpSourceEvent): boolean;
  isCurrentInternalScreencastEvent(
    tabId: number,
    active: InternalScreencast,
    event: CdpSourceEvent,
  ): boolean;
  activeRetiredInternalScreencastSessions(
    tabId: number,
  ): Map<number, { expiresAt: number }>;
  retireInternalScreencast(tabId: number, active: InternalScreencast): void;
}
/** Original $N. Numbers including NaN are retained; no added session-id validation. */
export function screencastSessionId(event: CdpSourceEvent) {
  if (event.params == null) return;
  const id = Reflect.get(event.params, "sessionId");
  return typeof id === "number" ? id : undefined;
}
/** Original Io/jh: root events have neither child session nor target id. */
export function isRootCdpEvent(event: CdpSourceEvent) {
  return event.source.sessionId == null && event.source.targetId == null;
}
/** Original qh method group. Owner fields remain those of qh, supplied by its eventual full constructor. */
export const screencastMethods = {
  async withInternalScreencast<T>(
    this: ScreencastOwner,
    tabId: unknown,
    run: (matches: (event: CdpSourceEvent) => boolean) => Promise<T>,
  ): Promise<T | undefined> {
    const id = Number(tabId);
    if (!Number.isFinite(id))
      throw new Error("withInternalScreencast requires numeric tab_id");
    return await this.withScreencastLock(id, async () => {
      if (this.rawScreencastTabIds.has(id)) return;
      const session: InternalScreencast = { sessionIds: new Set() };
      this.activeInternalScreencastsByTabId.set(id, session);
      try {
        return await run((event) =>
          this.isCurrentInternalScreencastEvent(id, session, event),
        );
      } finally {
        if (this.activeInternalScreencastsByTabId.get(id) === session)
          this.activeInternalScreencastsByTabId.delete(id);
        this.retireInternalScreencast(id, session);
      }
    });
  },
  async withScreencastLock<T>(
    this: ScreencastOwner,
    tabId: number,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.screencastQueuesByTabId.get(tabId) ?? Promise.resolve();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      queued = previous.then(() => held);
    this.screencastQueuesByTabId.set(tabId, queued);
    await previous;
    try {
      return await run();
    } finally {
      release();
      if (this.screencastQueuesByTabId.get(tabId) === queued)
        this.screencastQueuesByTabId.delete(tabId);
    }
  },
  isInternalScreencastEvent(
    this: ScreencastOwner,
    tabId: number,
    event: CdpSourceEvent,
  ): boolean {
    if (!isRootCdpEvent(event)) return false;
    const active = this.activeInternalScreencastsByTabId.get(tabId);
    if (event.method === "Page.screencastVisibilityChanged")
      return active != null;
    if (event.method !== "Page.screencastFrame") return false;
    const id = screencastSessionId(event);
    return id != null &&
      this.activeRetiredInternalScreencastSessions(tabId).has(id)
      ? true
      : active == null
        ? false
        : (id != null && active.sessionIds.add(id), true);
  },
  isCurrentInternalScreencastEvent(
    this: ScreencastOwner,
    tabId: number,
    active: InternalScreencast,
    event: CdpSourceEvent,
  ): boolean {
    if (
      this.activeInternalScreencastsByTabId.get(tabId) !== active ||
      !isRootCdpEvent(event)
    )
      return false;
    if (event.method === "Page.screencastVisibilityChanged") return true;
    if (event.method !== "Page.screencastFrame") return false;
    const id = screencastSessionId(event);
    return id != null && active.sessionIds.has(id);
  },
  activeRetiredInternalScreencastSessions(
    this: ScreencastOwner,
    tabId: number,
  ): Map<number, { expiresAt: number }> {
    const retired =
        this.retiredInternalScreencastSessionsByTabId.get(tabId) ?? new Map(),
      now = Date.now();
    for (const [id, session] of retired)
      if (session.expiresAt <= now) retired.delete(id);
    if (retired.size === 0)
      this.retiredInternalScreencastSessionsByTabId.delete(tabId);
    return retired;
  },
  retireInternalScreencast(
    this: ScreencastOwner,
    tabId: number,
    active: InternalScreencast,
  ): void {
    if (active.sessionIds.size === 0) return;
    const retired = this.activeRetiredInternalScreencastSessions(tabId),
      expiresAt = Date.now() + 10000;
    for (const id of active.sessionIds) retired.set(id, { expiresAt });
    while (retired.size > 32) {
      const first = retired.keys().next().value;
      if (first == null) break;
      retired.delete(first);
    }
    this.retiredInternalScreencastSessionsByTabId.set(tabId, retired);
  },
};
