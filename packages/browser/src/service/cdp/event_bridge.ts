import type { CdpTarget } from "./dispatch_helpers";
import type { FrameEvent } from "./frame_methods";
import type { CdpDispatchOptions } from "./execute_methods";
import { assertCdpDeadline } from "./deadline";
export interface CdpEventBridgeOwner {
  api: {
    addEventListener(name: string, listener: (event: any) => void): unknown;
  };
  tabAttachmentPromises: Map<number, Promise<unknown>>;
  attachedTabIdForCdpEvent(source: Partial<CdpTarget>): number | undefined;
  forgetAttachedTab(tabId: number): unknown;
  isInternalScreencastEvent(tabId: number, event: FrameEvent): boolean;
  hasBrowserAuthRawEventProtection(tabId: number): boolean;
  recordRawCdpEvent(tabId: number, event: FrameEvent): unknown;
  handleTargetEvent(event: FrameEvent): unknown;
  emit(name: string, event: FrameEvent): unknown;
  on(name: string, listener: (event: FrameEvent) => void): unknown;
  addTabAttachHandler(
    handler: (tabId: number, options: CdpDispatchOptions) => Promise<void>,
  ): unknown;
  addTabCleanupHandler(handler: (tabId: number) => Promise<void>): unknown;
  call(
    tabId: number,
    method: string,
    params: undefined,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
  enableOopifAutoAttach(
    tabId: number,
    options: CdpDispatchOptions,
  ): Promise<void>;
  detachAttachedFrameTargets(tabId: number): Promise<void>;
  handleJavaScriptDialogEvent(event: FrameEvent): unknown;
}
/** Event registrations from the original qh constructor, after owner fields are assigned.
 * This is constructor wiring, not a standalone manager or a replacement provider.
 */
export function registerCdpEventBridge(owner: CdpEventBridgeOwner) {
  owner.api.addEventListener("onCDPDetach", (source) => {
    const tabId =
      owner.attachedTabIdForCdpEvent(source) ??
      (typeof source.tabId === "number" &&
      owner.tabAttachmentPromises.has(source.tabId)
        ? source.tabId
        : undefined);
    if (tabId != null) owner.forgetAttachedTab(tabId);
  });
  owner.api.addEventListener("onCDPEvent", (event) => {
    const tabId = owner.attachedTabIdForCdpEvent(event.source);
    if (tabId == null) return;
    if (
      !owner.isInternalScreencastEvent(tabId, event) &&
      !owner.hasBrowserAuthRawEventProtection(tabId)
    )
      owner.recordRawCdpEvent(tabId, event);
    const normalized = { ...event, source: { ...event.source, tabId } };
    owner.handleTargetEvent(normalized);
    owner.emit("event", normalized);
  });
  owner.addTabAttachHandler(async (tabId, options) => {
    await owner.call(tabId, "Page.enable", undefined, options);
    await owner.enableOopifAutoAttach(tabId, options);
  });
  owner.addTabCleanupHandler(async (tabId) => {
    await owner.detachAttachedFrameTargets(tabId);
  });
  owner.on("event", (event) => {
    owner.handleJavaScriptDialogEvent(event);
  });
}
export interface OopifOwner {
  oopifAutoAttachTabIds: Set<number>;
  waitForTabAttachment(
    tabId: number,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
  enableOopifAutoAttachForTarget(
    target: CdpTarget,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
}
/** Original qh.enableOopifAutoAttach; recheck the set after waiting for attachment. */
export async function enableOopifAutoAttach(
  this: OopifOwner,
  input: unknown,
  options: CdpDispatchOptions = {},
) {
  const tabId = Number(input);
  if (!Number.isFinite(tabId))
    throw new Error("enableOopifAutoAttach requires numeric tab_id");
  if (!this.oopifAutoAttachTabIds.has(tabId)) {
    assertCdpDeadline(options);
    await this.waitForTabAttachment(tabId, options);
    if (!this.oopifAutoAttachTabIds.has(tabId)) {
      await this.enableOopifAutoAttachForTarget({ tabId }, options);
      this.oopifAutoAttachTabIds.add(tabId);
    }
  }
}
