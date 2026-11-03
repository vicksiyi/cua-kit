import type { CdpTarget } from "./dispatch_helpers";
import type { CdpDispatchOptions } from "./execute_methods";
import type { FrameSession } from "./lifecycle_methods";
import { assertCdpDeadline } from "./deadline";
import { frameTargetId, isFrameTarget } from "./frame_methods";
export interface FrameTargetHint {
  url?: string;
  parentTarget?: CdpTarget;
}
export interface FrameTargetOwner {
  frameSessionsByTabId: Map<number, Map<string, FrameSession>>;
  frameSessionsBySessionId: Map<string, FrameSession>;
  api: { attachTarget?(tabId: number, targetId: string): Promise<unknown> };
  tryInitializeAttachedFrameSession(
    session: FrameSession,
    options: CdpDispatchOptions,
  ): Promise<void>;
  waitForTabAttachment(
    tabId: number,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
  callTarget(
    target: CdpTarget,
    method: string,
    params: unknown,
    options: CdpDispatchOptions,
  ): Promise<any>;
  attachDebuggerFrameTarget(
    tabId: number,
    targetId: string,
    frameId: string | null | undefined,
    options: CdpDispatchOptions,
  ): Promise<CdpTarget | null>;
  targetForFrame(tabId: unknown, frameId: string): CdpTarget | null;
  setFrameSessionForFrame(
    tabId: number,
    frameId: string,
    session: FrameSession,
  ): void;
  setFrameSessionTargetId(
    tabId: number,
    targetId: string,
    session: FrameSession,
  ): void;
  rememberAttachedFrameTarget(tabId: number, targetId: string): void;
}
/** Original xte/Ete; missing tabId is eligible, an explicit different tabId is not. */
export function targetBelongsToTab(info: any, tabId: number) {
  return !("tabId" in info) || info.tabId == null ? true : info.tabId === tabId;
}
export function targetMatchesFrameHint(info: any, hint: FrameTargetHint) {
  return info.type === "iframe"
    ? true
    : info.type === "other" && hint.url != null && info.url === hint.url;
}
export const frameTargetMethods = {
  targetForFrame(this: FrameTargetOwner, input: unknown, frameId: string) {
    const tabId = Number(input);
    return Number.isFinite(tabId)
      ? (this.frameSessionsByTabId.get(tabId)?.get(frameId)?.target ?? null)
      : null;
  },
  targetIdForFrame(this: FrameTargetOwner, input: unknown, frameId: string) {
    const tabId = Number(input);
    return Number.isFinite(tabId)
      ? (this.frameSessionsByTabId.get(tabId)?.get(frameId)?.targetId ?? null)
      : null;
  },
  async targetForFrameOrAttach(
    this: FrameTargetOwner,
    input: unknown,
    frameId: string | null | undefined,
    options: CdpDispatchOptions = {},
    hint: FrameTargetHint = {},
  ) {
    const tabId = Number(input);
    if (!Number.isFinite(tabId)) return null;
    if (frameId != null) {
      const existing = this.frameSessionsByTabId.get(tabId)?.get(frameId);
      if (existing != null) {
        await this.tryInitializeAttachedFrameSession(existing, options);
        return existing.target;
      }
    }
    assertCdpDeadline(options);
    await this.waitForTabAttachment(tabId, options);
    const result = await this.callTarget(
      { tabId },
      "Target.getTargets",
      {},
      options,
    ).catch(() => null);
    assertCdpDeadline(options);
    const infos: any[] =
      result?.targetInfos.filter((info: any) =>
        targetBelongsToTab(info, tabId),
      ) ?? [];
    const exact = infos.find(
      (info) => isFrameTarget(info) && frameTargetId(info) === frameId,
    );
    const candidates = infos.filter((info) =>
      targetMatchesFrameHint(info, hint),
    );
    const sameUrl =
      hint.url == null
        ? []
        : candidates.filter((info) => info.url === hint.url);
    const selected = exact ?? (sameUrl.length === 1 ? sameUrl[0] : undefined);
    const targetId = frameTargetId(selected);
    if (selected == null || targetId == null) return null;
    if (
      exact == null &&
      !("tabId" in selected && selected.tabId === tabId) &&
      this.frameSessionsByTabId.get(tabId)?.has(targetId) !== true
    ) {
      const parent = hint.parentTarget ?? { tabId };
      if (parent.tabId !== tabId) return null;
      const owner = await this.callTarget(
        parent,
        "DOM.getFrameOwner",
        { frameId: targetId },
        options,
      ).catch(() => null);
      assertCdpDeadline(options);
      if (typeof owner?.backendNodeId !== "number") return null;
    }
    return (
      (await this.attachDebuggerFrameTarget(
        tabId,
        targetId,
        frameId,
        options,
      )) ?? (frameId == null ? null : this.targetForFrame(tabId, frameId))
    );
  },
  async attachDebuggerFrameTarget(
    this: FrameTargetOwner,
    tabId: number,
    targetId: string,
    frameId: string | null | undefined,
    options: CdpDispatchOptions,
  ) {
    const sessionId = `target:${targetId}`;
    const existing =
      this.frameSessionsByTabId.get(tabId)?.get(targetId) ??
      this.frameSessionsBySessionId.get(sessionId);
    if (existing != null) {
      if (existing.target.tabId !== tabId) return null;
      if (frameId != null)
        this.setFrameSessionForFrame(tabId, frameId, existing);
      await this.tryInitializeAttachedFrameSession(existing, options);
      return existing.target;
    }
    const api = this.api;
    if (typeof api.attachTarget !== "function") return null;
    assertCdpDeadline(options);
    try {
      await api.attachTarget(tabId, targetId);
    } catch {
      assertCdpDeadline(options);
      return null;
    }
    const session = this.frameSessionsByTabId.get(tabId)?.get(targetId) ??
      this.frameSessionsBySessionId.get(sessionId) ?? {
        frameId: null,
        sessionId,
        target: { tabId, targetId },
        targetId,
      };
    this.frameSessionsBySessionId.set(session.sessionId, session);
    this.setFrameSessionTargetId(tabId, targetId, session);
    this.setFrameSessionForFrame(tabId, frameId ?? targetId, session);
    this.rememberAttachedFrameTarget(tabId, targetId);
    assertCdpDeadline(options);
    await this.tryInitializeAttachedFrameSession(session, options);
    return session.target;
  },
};
