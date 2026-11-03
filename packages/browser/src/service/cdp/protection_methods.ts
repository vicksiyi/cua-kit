import type { CdpTarget } from "./dispatch_helpers";
import type { CdpDispatchOptions } from "./execute_methods";
export interface WorkerBypassState {
  count: number;
  enabled: boolean;
  pending: Promise<void>;
}
export interface CdpProtectionOwner {
  attachedTabIds: Set<number>;
  suppressedRawNetworkByTab: Map<number, number>;
  browserAuthCredentialDiagnosticsTabs: Set<number>;
  workerStartProtectionByTab: Map<number, number>;
  browserAuthWorkerBypassByTab: Map<number, WorkerBypassState>;
  configuredWorkerStartProtection: Set<number>;
  workerStartConfigurationByTab: Map<number, Promise<void>>;
  api: {
    browserAuthNewTargetProtection(request: {
      tabId: number;
      action: string;
      leaseId?: string;
      targetId?: string;
    }): Promise<unknown>;
  };
  waitForTabAttachment(tabId: number): Promise<unknown>;
  configureServiceWorkerStarts(tabId: number): Promise<void>;
  isTabAttached(tabId: unknown): boolean;
  call(
    tabId: number,
    method: string,
    params: unknown,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
  enableOopifAutoAttachForTarget(
    target: CdpTarget,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
}
/** Original qh credential/worker protection state; privileged protection stays in the provider API. */
export const protectionMethods = {
  isTabAttached(this: CdpProtectionOwner, input: unknown) {
    return this.attachedTabIds.has(Number(input));
  },
  suppressRawNetworkEvents(this: CdpProtectionOwner, tabId: number) {
    this.suppressedRawNetworkByTab.set(
      tabId,
      (this.suppressedRawNetworkByTab.get(tabId) ?? 0) + 1,
    );
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const count = this.suppressedRawNetworkByTab.get(tabId) ?? 0;
      if (count <= 1) this.suppressedRawNetworkByTab.delete(tabId);
      else this.suppressedRawNetworkByTab.set(tabId, count - 1);
    };
  },
  hasBrowserAuthRawEventProtection(this: CdpProtectionOwner, tabId: number) {
    return (
      this.suppressedRawNetworkByTab.has(tabId) ||
      this.browserAuthCredentialDiagnosticsTabs.has(tabId)
    );
  },
  protectBrowserAuthCredentialDiagnostics(
    this: CdpProtectionOwner,
    tabId: number,
  ) {
    this.browserAuthCredentialDiagnosticsTabs.add(tabId);
  },
  async browserAuthNewTargetCheck(this: CdpProtectionOwner, tabId: number) {
    try {
      return (await this.api.browserAuthNewTargetProtection({
        tabId,
        action: "check",
      })) === true
        ? "contained"
        : "rejected";
    } catch {
      return "error";
    }
  },
  async protectBrowserAuthNewTargets(this: CdpProtectionOwner, tabId: number) {
    const leaseId = crypto.randomUUID();
    if (
      (await this.api.browserAuthNewTargetProtection({
        tabId,
        action: "acquire",
        leaseId,
      })) !== true
    )
      throw new Error("Browser cannot protect newly opened credential targets");
    return async () => {
      if (
        (await this.api.browserAuthNewTargetProtection({
          tabId,
          action: "release",
          leaseId,
        })) !== true
      )
        throw new Error(
          "Browser could not release credential target protection",
        );
    };
  },
  async closeBrowserAuthPausedTarget(
    this: CdpProtectionOwner,
    tabId: number,
    targetId: string,
  ) {
    return (
      (await this.api.browserAuthNewTargetProtection({
        tabId,
        action: "close",
        targetId,
      })) === true
    );
  },
  async protectServiceWorkerStarts(this: CdpProtectionOwner, tabId: number) {
    await this.waitForTabAttachment(tabId);
    this.workerStartProtectionByTab.set(
      tabId,
      (this.workerStartProtectionByTab.get(tabId) ?? 0) + 1,
    );
    const release = async () => {
      const count = this.workerStartProtectionByTab.get(tabId) ?? 0;
      if (count <= 1) this.workerStartProtectionByTab.delete(tabId);
      else this.workerStartProtectionByTab.set(tabId, count - 1);
      await this.configureServiceWorkerStarts(tabId);
    };
    try {
      await this.configureServiceWorkerStarts(tabId);
    } catch (error) {
      await release();
      throw error;
    }
    let active = true;
    return async () => {
      if (active) {
        active = false;
        await release();
      } else await this.configureServiceWorkerStarts(tabId);
    };
  },
  async protectBrowserAuthServiceWorkerBypass(
    this: CdpProtectionOwner,
    tabId: number,
  ) {
    await this.waitForTabAttachment(tabId);
    const state = this.browserAuthWorkerBypassByTab.get(tabId) ?? {
      count: 0,
      enabled: false,
      pending: Promise.resolve(),
    };
    this.browserAuthWorkerBypassByTab.set(tabId, state);
    const configure = () => {
      const pending = state.pending
        .catch(() => {})
        .then(async () => {
          if (this.browserAuthWorkerBypassByTab.get(tabId) !== state) return;
          const enabled = state.count > 0;
          if (state.enabled !== enabled) {
            await this.call(
              tabId,
              "Network.setBypassServiceWorker",
              { bypass: enabled },
              { preserveDebuggerOnTimeout: true },
            );
            state.enabled = enabled;
          }
          if (state.count === 0 && !state.enabled)
            this.browserAuthWorkerBypassByTab.delete(tabId);
        });
      state.pending = pending;
      return pending;
    };
    state.count++;
    try {
      await configure();
    } catch (error) {
      state.count--;
      await configure().catch(() => {});
      throw error;
    }
    let active = true;
    return async () => {
      if (active) {
        active = false;
        state.count--;
      }
      await configure();
    };
  },
  configureServiceWorkerStarts(this: CdpProtectionOwner, tabId: number) {
    const pending = (
      this.workerStartConfigurationByTab.get(tabId) ?? Promise.resolve()
    )
      .catch(() => {})
      .then(async () => {
        if (!this.isTabAttached(tabId)) return;
        const protect = this.workerStartProtectionByTab.has(tabId);
        if (this.configuredWorkerStartProtection.has(tabId) !== protect) {
          if (protect) {
            await this.call(
              tabId,
              "Target.setAutoAttach",
              {
                autoAttach: true,
                flatten: true,
                waitForDebuggerOnStart: true,
                filter: [
                  { type: "iframe", exclude: false },
                  { type: "service_worker", exclude: false },
                ],
              },
              { preserveDebuggerOnTimeout: true },
            );
            this.configuredWorkerStartProtection.add(tabId);
          } else {
            await this.enableOopifAutoAttachForTarget(
              { tabId },
              { preserveDebuggerOnTimeout: true },
            );
            this.configuredWorkerStartProtection.delete(tabId);
          }
        }
      });
    this.workerStartConfigurationByTab.set(tabId, pending);
    pending
      .finally(() => {
        if (this.workerStartConfigurationByTab.get(tabId) === pending)
          this.workerStartConfigurationByTab.delete(tabId);
      })
      .catch(() => {});
    return pending;
  },
};
