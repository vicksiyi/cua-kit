import { frameTargetId } from "./frame_methods";
export interface CloseOwner {
  tabAttachmentPromises: Map<number, Promise<unknown>>;
  fileChoosersById: Map<string, { tabId: number }>;
  api: { executeCdp(payload: unknown): Promise<unknown> };
  detachTab(tabId: number, reason?: string): Promise<unknown>;
  call(tabId: unknown, method: string, params: unknown): Promise<any>;
  waitForTabAttachment(tabId: number): Promise<unknown>;
  runTabCleanupHandlers(tabId: number): Promise<unknown>;
  forgetAttachedTab(tabId: number): unknown;
}
export const closeMethods = {
  async detachAllTabs(this: CloseOwner, reason?: string) {
    const tabs = [...this.tabAttachmentPromises.keys()];
    await Promise.allSettled(
      tabs.map(async (tabId) => this.detachTab(tabId, reason)),
    );
  },
  async closeTab(this: CloseOwner, input: unknown) {
    const tabId = Number(input);
    if (!Number.isFinite(tabId))
      throw new Error("closeTab requires numeric tab_id");
    const target = (
      await this.call(input, "Target.getTargets", {})
    ).targetInfos.find((info: any) =>
      "tabId" in info ? info.tabId === tabId : false,
    );
    await this.waitForTabAttachment(tabId);
    try {
      await this.runTabCleanupHandlers(tabId);
      const targetId = frameTargetId(target);
      if (targetId != null)
        await this.api.executeCdp({
          target: { tabId },
          method: "Target.closeTarget",
          commandParams: { targetId },
        });
      else
        await this.api.executeCdp({
          target: { tabId },
          method: "Page.close",
          commandParams: {},
        });
    } finally {
      this.forgetAttachedTab(tabId);
    }
  },
  deleteFileChoosersForTab(this: CloseOwner, tabId: number) {
    for (const [id, chooser] of this.fileChoosersById)
      if (chooser.tabId === tabId) this.fileChoosersById.delete(id);
  },
};
