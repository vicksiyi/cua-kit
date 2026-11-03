import type { CdpTarget } from "./dispatch_helpers";
export interface FrameSession {
  frameId: string | null;
  sessionId: string;
  target: CdpTarget;
  targetId: string;
}
export interface CdpLifecycleOwner {
  attachedTabIds: Set<number>;
  initializingTabIds: Set<number>;
  turnEndDetachTabIds: Set<number>;
  tabAttachmentPromises: Map<number, Promise<unknown>>;
  frameSessionsBySessionId: Map<string, FrameSession>;
  frameSessionsByTabId: Map<number, Map<string, FrameSession>>;
  jsDialogsByTabId: Map<number, { target: CdpTarget }>;
  oopifAutoAttachTabIds: Set<number>;
  workerStartProtectionByTab: Map<number, unknown>;
  browserAuthWorkerBypassByTab: Map<number, unknown>;
  configuredWorkerStartProtection: Set<number>;
  workerStartConfigurationByTab: Map<number, unknown>;
  rawScreencastTabIds: Set<number>;
  retiredInternalScreencastSessionsByTabId: Map<number, unknown>;
  mainFrameIdsByTabId: Map<number, string>;
  topLevelSecurityOriginsByTabId: Map<number, string>;
  topLevelUrlsByTabId: Map<number, string>;
  attachedFrameTargetIdsByTabId: Map<number, Set<string>>;
  api: {
    detach(tabId: number): Promise<unknown>;
    detachTarget?(tabId: number, targetId: string): Promise<unknown>;
  };
  deleteFileChoosersForTab(tabId: number): unknown;
  deleteFrameSessionsForTab(tabId: number): void;
  discardRawCdpEventsForTab(tabId: number): unknown;
  runTabCleanupHandlers(tabId: number): Promise<unknown>;
  forgetAttachedTab(tabId: number, force?: boolean): void;
  emit(event: "tabDetached", tabId: number, reason?: "turnEnded"): unknown;
}
/** qh lifecycle methods; provider, raw-event storage and file choosers belong to the manager. */
export const lifecycleMethods = {
  attachedTabIdForCdpEvent(
    this: CdpLifecycleOwner,
    source: Partial<CdpTarget>,
  ) {
    if (typeof source.tabId === "number")
      return this.attachedTabIds.has(source.tabId) ? source.tabId : undefined;
    if (source.sessionId != null)
      return this.frameSessionsBySessionId.get(source.sessionId)?.target.tabId;
    if (source.targetId != null) {
      for (const [tabId, sessions] of this.frameSessionsByTabId)
        if (sessions.has(source.targetId)) return tabId;
    }
  },
  async detachTab(
    this: CdpLifecycleOwner,
    tabIdInput: unknown,
    reason?: string,
  ) {
    const tabId = Number(tabIdInput);
    if (!Number.isFinite(tabId))
      throw new Error("detachTab requires numeric tab_id");
    while (!this.attachedTabIds.has(tabId)) {
      const pending = this.tabAttachmentPromises.get(tabId);
      if (pending == null) return;
      await pending.catch(() => {});
    }
    try {
      await this.runTabCleanupHandlers(tabId);
      if (reason === "turnEnded") this.turnEndDetachTabIds.add(tabId);
      await this.api.detach(tabId);
    } finally {
      this.forgetAttachedTab(tabId);
      this.turnEndDetachTabIds.delete(tabId);
    }
  },
  forgetAttachedTab(this: CdpLifecycleOwner, tabId: number, force = false) {
    if (this.initializingTabIds.has(tabId)) {
      this.attachedTabIds.delete(tabId);
      return;
    }
    this.tabAttachmentPromises.delete(tabId);
    if (!this.attachedTabIds.has(tabId) && !force) return;
    this.deleteFileChoosersForTab(tabId);
    this.deleteFrameSessionsForTab(tabId);
    this.jsDialogsByTabId.delete(tabId);
    this.oopifAutoAttachTabIds.delete(tabId);
    this.workerStartProtectionByTab.delete(tabId);
    this.browserAuthWorkerBypassByTab.delete(tabId);
    this.configuredWorkerStartProtection.delete(tabId);
    this.workerStartConfigurationByTab.delete(tabId);
    this.discardRawCdpEventsForTab(tabId);
    this.rawScreencastTabIds.delete(tabId);
    this.retiredInternalScreencastSessionsByTabId.delete(tabId);
    this.mainFrameIdsByTabId.delete(tabId);
    this.topLevelSecurityOriginsByTabId.delete(tabId);
    this.topLevelUrlsByTabId.delete(tabId);
    this.attachedTabIds.delete(tabId);
    this.emit(
      "tabDetached",
      tabId,
      this.turnEndDetachTabIds.has(tabId) ? "turnEnded" : undefined,
    );
  },
  setFrameSessionForFrame(
    this: CdpLifecycleOwner,
    tabId: number,
    frameId: string,
    session: FrameSession,
  ) {
    const sessions = this.frameSessionsByTabId.get(tabId) ?? new Map();
    this.frameSessionsByTabId.set(tabId, sessions);
    if (
      session.frameId != null &&
      session.frameId !== frameId &&
      session.frameId !== session.targetId
    )
      sessions.delete(session.frameId);
    session.frameId = frameId;
    sessions.set(frameId, session);
  },
  setFrameSessionTargetId(
    this: CdpLifecycleOwner,
    tabId: number,
    targetId: string,
    session: FrameSession,
  ) {
    const sessions = this.frameSessionsByTabId.get(tabId) ?? new Map();
    this.frameSessionsByTabId.set(tabId, sessions);
    if (session.targetId !== targetId && session.targetId !== session.frameId)
      sessions.delete(session.targetId);
    session.targetId = targetId;
    sessions.set(targetId, session);
  },
  deleteFrameSession(this: CdpLifecycleOwner, session: FrameSession) {
    this.frameSessionsBySessionId.delete(session.sessionId);
    if (
      this.jsDialogsByTabId.get(session.target.tabId)?.target.sessionId ===
      session.sessionId
    )
      this.jsDialogsByTabId.delete(session.target.tabId);
    const sessions = this.frameSessionsByTabId.get(session.target.tabId);
    if (session.frameId != null) sessions?.delete(session.frameId);
    sessions?.delete(session.targetId);
  },
  deleteFrameSessionsForTab(this: CdpLifecycleOwner, tabId: number) {
    const sessions = this.frameSessionsByTabId.get(tabId);
    if (sessions != null) {
      for (const session of sessions.values())
        this.frameSessionsBySessionId.delete(session.sessionId);
      this.frameSessionsByTabId.delete(tabId);
    }
  },
  rememberAttachedFrameTarget(
    this: CdpLifecycleOwner,
    tabId: number,
    targetId: string,
  ) {
    const targets = this.attachedFrameTargetIdsByTabId.get(tabId) ?? new Set();
    this.attachedFrameTargetIdsByTabId.set(tabId, targets);
    targets.add(targetId);
  },
  async detachAttachedFrameTargets(this: CdpLifecycleOwner, tabId: number) {
    const targets = this.attachedFrameTargetIdsByTabId.get(tabId);
    if (targets == null) return;
    this.attachedFrameTargetIdsByTabId.delete(tabId);
    const api = this.api;
    if (typeof api.detachTarget === "function")
      await Promise.allSettled(
        [...targets].map(async (targetId) =>
          api.detachTarget!(tabId, targetId),
        ),
      );
  },
};
