import type { FrameSession } from "./lifecycle_methods";
import type { CdpTarget } from "./dispatch_helpers";
import type { CdpDispatchOptions } from "./execute_methods";
import {
  assertCdpDeadline,
  prepareCdpDispatch,
  awaitCdpDeadline,
  dispatchTimeout,
} from "./deadline";
export interface FrameEvent {
  method: string;
  source: Partial<CdpTarget>;
  params: any;
}
/** Uh/HN/GN/VN: preserve the original distinctions between root and session events. */
export function frameTargetId(info: any): string | undefined {
  if (typeof info?.targetId === "string") return info.targetId;
  if (typeof info?.id === "string") return info.id;
}
export function isFrameTarget(info: any) {
  return info.type === "iframe" || info.type === "other";
}
export function isRootFrameNavigation(event: FrameEvent) {
  return (
    typeof event.source.tabId === "number" &&
    event.source.sessionId == null &&
    event.source.targetId == null &&
    event.params.frame.parentId == null
  );
}
export function isMainDocumentNavigation(
  event: FrameEvent,
  mainFrames: Map<number, string>,
) {
  return (
    typeof event.source.tabId === "number" &&
    event.source.sessionId == null &&
    mainFrames.get(event.source.tabId) === event.params.frameId
  );
}
export interface CdpFrameOwner {
  mainFrameIdsByTabId: Map<number, string>;
  topLevelUrlsByTabId: Map<number, string>;
  topLevelSecurityOriginsByTabId: Map<number, string>;
  frameSessionsBySessionId: Map<string, FrameSession>;
  frameSessionsByTabId: Map<number, Map<string, FrameSession>>;
  initializedFrameSessions: WeakSet<FrameSession>;
  frameSessionInitializationPromises: WeakMap<FrameSession, Promise<void>>;
  api: { executeCdp(payload: unknown): Promise<any> };
  discardRawCdpEventsForTab(tabId: number): unknown;
  handleAttachedToTarget(event: FrameEvent): void;
  handleDetachedFromTarget(event: FrameEvent): void;
  handleFrameNavigated(event: FrameEvent): void;
  handleFrameDetached(event: FrameEvent): void;
  setFrameSessionTargetId(
    tabId: number,
    targetId: string,
    session: FrameSession,
  ): void;
  setFrameSessionForFrame(
    tabId: number,
    frameId: string,
    session: FrameSession,
  ): void;
  deleteFrameSession(session: FrameSession): void;
  initializeAttachedFrameSession(
    session: FrameSession,
    options?: CdpDispatchOptions,
  ): Promise<void>;
  runAttachedFrameSessionInitialization(
    session: FrameSession,
    options?: CdpDispatchOptions,
  ): Promise<void>;
}
/** Original qh target/frame event and initialization methods; lifecycle indices share the same owner. */
export const frameMethods = {
  handleTargetEvent(this: CdpFrameOwner, event: FrameEvent) {
    if (event.method === "Target.attachedToTarget") {
      this.handleAttachedToTarget(event);
      return;
    }
    if (event.method === "Target.detachedFromTarget") {
      this.handleDetachedFromTarget(event);
      return;
    }
    if (event.method === "Page.frameNavigated") {
      if (isRootFrameNavigation(event)) {
        const tabId = event.source.tabId!,
          origin = event.params.frame.securityOrigin;
        this.mainFrameIdsByTabId.set(tabId, event.params.frame.id);
        this.topLevelUrlsByTabId.set(tabId, event.params.frame.url);
        if (this.topLevelSecurityOriginsByTabId.get(tabId) !== origin)
          this.discardRawCdpEventsForTab(tabId);
        this.topLevelSecurityOriginsByTabId.set(tabId, origin);
      }
      this.handleFrameNavigated(event);
      return;
    }
    if (event.method === "Page.navigatedWithinDocument") {
      if (isMainDocumentNavigation(event, this.mainFrameIdsByTabId))
        this.topLevelUrlsByTabId.set(event.source.tabId!, event.params.url);
      return;
    }
    if (event.method === "Page.frameDetached") this.handleFrameDetached(event);
  },
  handleAttachedToTarget(this: CdpFrameOwner, event: FrameEvent) {
    const tabId = event.source.tabId,
      info = event.params.targetInfo,
      sessionId = event.params.sessionId;
    if (
      typeof tabId !== "number" ||
      typeof sessionId !== "string" ||
      !isFrameTarget(info)
    )
      return;
    const targetId = frameTargetId(info);
    if (targetId == null) return;
    const existing = this.frameSessionsBySessionId.get(sessionId);
    if (existing != null) {
      this.setFrameSessionTargetId(tabId, targetId, existing);
      return;
    }
    const session: FrameSession = {
      frameId: null,
      sessionId,
      target: { tabId, sessionId },
      targetId,
    };
    this.frameSessionsBySessionId.set(sessionId, session);
    this.setFrameSessionTargetId(tabId, targetId, session);
  },
  handleDetachedFromTarget(this: CdpFrameOwner, event: FrameEvent) {
    const session = this.frameSessionsBySessionId.get(event.params.sessionId);
    if (session != null) this.deleteFrameSession(session);
  },
  handleFrameNavigated(this: CdpFrameOwner, event: FrameEvent) {
    const sessionId = event.source.sessionId,
      tabId = event.source.tabId,
      frameId = event.params.frame.id;
    if (typeof tabId !== "number" || typeof sessionId !== "string") return;
    const session = this.frameSessionsBySessionId.get(sessionId);
    if (
      session != null &&
      !(session.frameId != null && session.frameId !== frameId)
    )
      this.setFrameSessionForFrame(tabId, frameId, session);
  },
  handleFrameDetached(this: CdpFrameOwner, event: FrameEvent) {
    const tabId = event.source.tabId;
    if (typeof tabId !== "number") return;
    const session = this.frameSessionsByTabId
      .get(tabId)
      ?.get(event.params.frameId);
    if (session != null) this.deleteFrameSession(session);
  },
  async initializeAttachedFrameSession(
    this: CdpFrameOwner,
    session: FrameSession,
    options: CdpDispatchOptions = {},
  ) {
    if (this.initializedFrameSessions.has(session)) return;
    const existing = this.frameSessionInitializationPromises.get(session);
    if (existing != null) {
      try {
        await prepareCdpDispatch(options, () => existing);
        return;
      } catch {
        assertCdpDeadline(options);
        return await this.initializeAttachedFrameSession(session, options);
      }
    }
    assertCdpDeadline(options);
    const pending = this.runAttachedFrameSessionInitialization(session, options)
      .then(() => {
        this.initializedFrameSessions.add(session);
      })
      .finally(() => {
        if (this.frameSessionInitializationPromises.get(session) === pending)
          this.frameSessionInitializationPromises.delete(session);
      });
    this.frameSessionInitializationPromises.set(session, pending);
    await awaitCdpDeadline(pending, options);
  },
  async tryInitializeAttachedFrameSession(
    this: CdpFrameOwner,
    session: FrameSession,
    options: CdpDispatchOptions,
  ) {
    await this.initializeAttachedFrameSession(session, options).catch(() => {});
    assertCdpDeadline(options);
  },
  async runAttachedFrameSessionInitialization(
    this: CdpFrameOwner,
    session: FrameSession,
    options: CdpDispatchOptions = {},
  ) {
    await this.api.executeCdp({
      target: session.target,
      method: "Page.enable",
      commandParams: {},
      timeoutMs: dispatchTimeout(options),
      preserveDebuggerOnTimeout: options.preserveDebuggerOnTimeout,
    });
    await this.api.executeCdp({
      target: session.target,
      method: "Runtime.enable",
      commandParams: {},
      timeoutMs: dispatchTimeout(options),
      preserveDebuggerOnTimeout: options.preserveDebuggerOnTimeout,
    });
    const result = await this.api.executeCdp({
      target: session.target,
      method: "Page.getFrameTree",
      commandParams: {},
      timeoutMs: dispatchTimeout(options),
      preserveDebuggerOnTimeout: options.preserveDebuggerOnTimeout,
    });
    if (this.frameSessionsBySessionId.get(session.sessionId) !== session)
      return;
    const frameId = result.frameTree.frame.id;
    this.setFrameSessionForFrame(session.target.tabId, frameId, session);
  },
};
