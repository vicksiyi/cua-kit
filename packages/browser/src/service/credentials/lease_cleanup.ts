import type { FrameEvent } from "../cdp/frame_methods";
export interface LeaseCleanupCdp {
  call(
    tabId: number,
    method: string,
    params?: object,
    options?: { preserveDebuggerOnTimeout: boolean },
  ): Promise<any>;
  waitForEvent(
    tabId: number,
    predicate: (event: FrameEvent) => boolean,
    options: { timeoutMs: number; timeoutMessage: string },
  ): Promise<unknown>;
  closeBrowserAuthPausedTarget(
    tabId: number,
    targetId: string,
  ): Promise<boolean>;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
}
/** Readable lifecycle portion of original Z_. Remaining lease policy/event methods are required from subclasses. */
export abstract class CredentialLeaseCleanup {
  abstract cdp: LeaseCleanupCdp;
  abstract requests: {
    removeListener(event: string, listener: (...args: any[]) => void): unknown;
  };
  abstract tabId: number;
  abstract frameId: string;
  abstract active: Map<number, unknown>;
  abstract onEvent: (...args: any[]) => void;
  abstract onTabDetached: (...args: any[]) => void;
  abstract onRequestResolution: (...args: any[]) => void;
  abstract unblockRawEvents: () => unknown;
  abstract setOutcome(
    outcome: string,
    reason: any,
    requestClass?: string,
  ): unknown;
  detached = false;
  discardRejectedHistory = false;
  blankNavigationPromise?: Promise<void>;
  closePromise?: Promise<void>;
  rejectedDocumentCleanup?: Promise<void>;
  removeWorkerProtection?: () => Promise<unknown>;
  removeNewPageProtection?: () => Promise<unknown>;
  removeWorkerBypass?: () => Promise<unknown>;
  removeInterceptor?: () => Promise<unknown>;
  pausedTargets = new Set<string>();
  closingTargets = new Map<string, Promise<void>>();
  navigateToBrowserBlank() {
    if (this.blankNavigationPromise == null) {
      const pending = this.quiesceWebsite();
      this.blankNavigationPromise = pending;
      pending.catch(() => {
        if (this.blankNavigationPromise === pending)
          this.blankNavigationPromise = undefined;
      });
    }
    return this.blankNavigationPromise;
  }
  async quiesceWebsite() {
    const before = await this.cdp.call(
      this.tabId,
      "Page.getFrameTree",
      undefined,
    );
    if (this.detached || before.frameTree.frame.id !== this.frameId)
      throw new Error("Browser cannot quiesce the credential document");
    const waited = this.cdp
      .waitForEvent(
        this.tabId,
        (event) => {
          if (
            event.source.sessionId != null ||
            event.source.targetId != null ||
            event.method !== "Page.frameNavigated" ||
            event.params == null ||
            !("frame" in event.params)
          )
            return false;
          const frame = event.params.frame;
          return (
            typeof frame === "object" &&
            frame != null &&
            "id" in frame &&
            frame.id === this.frameId &&
            (!("parentId" in frame) || frame.parentId == null) &&
            "url" in frame &&
            frame.url === "about:blank" &&
            (!("unreachableUrl" in frame) || frame.unreachableUrl == null)
          );
        },
        {
          timeoutMs: 5000,
          timeoutMessage: "Browser could not quiesce the credential document",
        },
      )
      .then(
        () => true,
        () => false,
      );
    const result = await this.cdp.call(
      this.tabId,
      "Page.navigate",
      { url: "about:blank" },
      { preserveDebuggerOnTimeout: true },
    );
    const observed = await waited;
    const after = (
      await this.cdp.call(this.tabId, "Page.getFrameTree", undefined)
    ).frameTree.frame;
    if (
      this.detached ||
      !observed ||
      result.errorText ||
      result.isDownload === true ||
      !result.loaderId ||
      result.frameId !== this.frameId ||
      after.id !== this.frameId ||
      after.loaderId !== result.loaderId ||
      after.loaderId === before.frameTree.frame.loaderId ||
      after.url !== "about:blank" ||
      after.unreachableUrl != null
    )
      throw new Error("Browser cannot quiesce the credential document");
    if (this.discardRejectedHistory)
      await this.cdp.call(
        this.tabId,
        "Page.resetNavigationHistory",
        undefined,
        { preserveDebuggerOnTimeout: true },
      );
  }
  rejectOrdinaryRequest(
    request: { resourceType: string; frameId?: string },
    outcome: string,
    reason: any,
  ) {
    if (
      request.resourceType === "Document" &&
      request.frameId === this.frameId &&
      this.rejectedDocumentCleanup == null
    ) {
      this.discardRejectedHistory = true;
      this.rejectedDocumentCleanup = Promise.resolve().then(async () => {
        try {
          await this.cdp.call(this.tabId, "Page.stopLoading", undefined, {
            preserveDebuggerOnTimeout: true,
          });
        } catch {}
        await this.navigateToBrowserBlank();
      });
      this.rejectedDocumentCleanup.then(() => this.close()).catch(() => {});
    }
    this.setOutcome(
      outcome,
      reason,
      request.resourceType === "Document" ? "main_document" : "background",
    );
    return "block";
  }
  close() {
    if (this.closePromise == null) {
      const pending = this.dispose();
      this.closePromise = pending;
      pending.catch(() => {
        if (this.closePromise === pending) this.closePromise = undefined;
      });
    }
    return this.closePromise;
  }
  async dispose() {
    await this.stopPausedTargets();
    await this.removeWorkerProtection?.();
    await this.removeNewPageProtection?.();
    await this.removeWorkerBypass?.();
    await this.removeInterceptor?.();
    await this.rejectedDocumentCleanup;
    if (!this.detached)
      await this.cdp.call(
        this.tabId,
        "Runtime.discardConsoleEntries",
        undefined,
        { preserveDebuggerOnTimeout: true },
      );
    if (this.active.get(this.tabId) === this) this.active.delete(this.tabId);
    this.cdp.removeListener("event", this.onEvent);
    this.cdp.removeListener("tabDetached", this.onTabDetached);
    this.requests.removeListener("requestResolution", this.onRequestResolution);
    this.unblockRawEvents();
  }
  stopPausedTarget(targetId: string): Promise<void> {
    const existing = this.closingTargets.get(targetId);
    if (existing != null) return existing;
    if (this.detached || !this.pausedTargets.has(targetId))
      return Promise.resolve();
    const pending = this.cdp
      .closeBrowserAuthPausedTarget(this.tabId, targetId)
      .then((closed) => {
        if (!closed && this.pausedTargets.has(targetId))
          throw new Error("Browser could not stop a protected target");
        this.pausedTargets.delete(targetId);
      })
      .finally(() => {
        if (this.closingTargets.get(targetId) === pending)
          this.closingTargets.delete(targetId);
      });
    this.closingTargets.set(targetId, pending);
    return pending;
  }
  async stopPausedTargets() {
    for (
      ;
      !this.detached &&
      (await Promise.all([
        ...this.closingTargets.values(),
        ...[...this.pausedTargets].map((target) =>
          this.stopPausedTarget(target),
        ),
      ]),
      !this.detached);
    ) {
      await this.cdp.call(
        this.tabId,
        "Target.getTargets",
        {},
        { preserveDebuggerOnTimeout: true },
      );
      if (this.pausedTargets.size === 0 && this.closingTargets.size === 0)
        return;
    }
    this.pausedTargets.clear();
  }
}
