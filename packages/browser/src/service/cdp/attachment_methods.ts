import {
  assertCdpDeadline,
  remainingCdpTimeout,
  dispatchTimeout,
  awaitCdpDeadline,
  isDeadlineError,
  tabAttachmentSetup,
} from "./deadline";
import type { CdpDispatchOptions } from "./execute_methods";
import type { CdpTarget } from "./dispatch_helpers";
type AttachHandler = (
  tabId: number,
  options: CdpDispatchOptions,
) => unknown | Promise<unknown>;
type CleanupHandler = (tabId: number) => unknown | Promise<unknown>;
export interface CdpAttachmentOwner {
  attachedTabIds: Set<number>;
  initializingTabIds: Set<number>;
  tabAttachmentPromises: Map<number, Promise<unknown>>;
  tabAttachHandlers: Set<AttachHandler>;
  tabCleanupHandlers: Set<CleanupHandler>;
  api: {
    attach(tabId: number, policy: unknown): Promise<unknown>;
    executeCdp(payload: unknown): Promise<unknown>;
  };
  readNetworkPolicy(): unknown | Promise<unknown>;
  emit(event: "tabAttached", tabId: number): unknown;
  performanceSpan: {
    withSpan<T>(
      name: string,
      attributes: Record<string, unknown>,
      run: () => Promise<T>,
    ): Promise<T>;
    currentCommandAttrs(): Record<string, unknown>;
  };
  forgetAttachedTab(tabId: number, force?: boolean): unknown;
  ensureAttachedTab(tabId: number, options?: CdpDispatchOptions): Promise<void>;
  attachTab(
    tabId: number,
    options: CdpDispatchOptions,
    isCurrent: () => boolean,
  ): Promise<void>;
  enableFocusEmulation(
    tabId: number,
    options: CdpDispatchOptions,
  ): Promise<void>;
  runTabAttachHandlers(
    tabId: number,
    options: CdpDispatchOptions,
  ): Promise<void>;
}
/** Original qh attachment methods. Provider/network policy and detach cleanup remain explicit owner dependencies. */
export const attachmentMethods = {
  addTabCleanupHandler(this: CdpAttachmentOwner, handler: CleanupHandler) {
    this.tabCleanupHandlers.add(handler);
    return () => {
      this.tabCleanupHandlers.delete(handler);
    };
  },
  addTabAttachHandler(this: CdpAttachmentOwner, handler: AttachHandler) {
    this.tabAttachHandlers.add(handler);
    return () => {
      this.tabAttachHandlers.delete(handler);
    };
  },
  async runTabAttachHandlers(
    this: CdpAttachmentOwner,
    tabId: number,
    options: CdpDispatchOptions,
  ) {
    const failed = (
      await Promise.allSettled(
        [...this.tabAttachHandlers].map(async (handler) =>
          handler(tabId, { ...options, [tabAttachmentSetup]: tabId }),
        ),
      )
    ).find(
      (result) =>
        result.status === "rejected" && isDeadlineError(result.reason),
    );
    if (failed?.status === "rejected") throw failed.reason;
  },
  async runTabCleanupHandlers(this: CdpAttachmentOwner, tabId: number) {
    await Promise.allSettled(
      [...this.tabCleanupHandlers].map(async (handler) => handler(tabId)),
    );
  },
  async waitForTabAttachment(
    this: CdpAttachmentOwner,
    tabId: number,
    options: CdpDispatchOptions = {},
  ) {
    const wait = async () =>
      await awaitCdpDeadline(
        this.ensureAttachedTab(tabId, {
          timeoutMs: remainingCdpTimeout(options),
          preserveDebuggerOnTimeout: options.preserveDebuggerOnTimeout,
          [tabAttachmentSetup]: options[tabAttachmentSetup],
        }),
        options,
      );
    if (
      options[tabAttachmentSetup] !== tabId &&
      (!this.attachedTabIds.has(tabId) || this.initializingTabIds.has(tabId))
    )
      await this.performanceSpan.withSpan(
        "browser_use.tab.wait_for_attach",
        {
          "browser_use.tab.id": tabId,
          ...this.performanceSpan.currentCommandAttrs(),
        },
        wait,
      );
    else await wait();
  },
  async ensureAttachedTab(
    this: CdpAttachmentOwner,
    tabId: number,
    options: CdpDispatchOptions = {},
  ) {
    if (
      this.attachedTabIds.has(tabId) &&
      (!this.initializingTabIds.has(tabId) ||
        options[tabAttachmentSetup] === tabId)
    )
      return;
    if (this.initializingTabIds.has(tabId) && !this.attachedTabIds.has(tabId))
      throw "Debugger unattached";
    let pending = this.tabAttachmentPromises.get(tabId);
    if (pending == null) {
      pending = this.performanceSpan.withSpan(
        "browser_use.tab.attach",
        {
          "browser_use.tab.id": tabId,
          ...this.performanceSpan.currentCommandAttrs(),
        },
        () =>
          this.attachTab(
            tabId,
            options,
            () => this.tabAttachmentPromises.get(tabId) === pending,
          ),
      );
      this.tabAttachmentPromises.set(tabId, pending);
    }
    try {
      await pending;
    } catch (error) {
      if (this.tabAttachmentPromises.get(tabId) === pending)
        this.forgetAttachedTab(tabId);
      throw error;
    }
  },
  async attachTab(
    this: CdpAttachmentOwner,
    tabId: number,
    options: CdpDispatchOptions,
    isCurrent: () => boolean,
  ) {
    await this.api.attach(tabId, await this.readNetworkPolicy());
    await this.enableFocusEmulation(tabId, options);
    if (!isCurrent()) throw new Error("Debugger detached while attaching");
    this.attachedTabIds.add(tabId);
    this.initializingTabIds.add(tabId);
    try {
      this.emit("tabAttached", tabId);
      await this.runTabAttachHandlers(tabId, options);
    } finally {
      this.initializingTabIds.delete(tabId);
      if (!this.attachedTabIds.has(tabId)) this.forgetAttachedTab(tabId, true);
    }
    if (!this.attachedTabIds.has(tabId)) throw "Debugger unattached";
  },
  async enableFocusEmulation(
    this: CdpAttachmentOwner,
    tabId: number,
    options: CdpDispatchOptions,
  ) {
    try {
      await this.api.executeCdp({
        target: { tabId },
        method: "Emulation.setFocusEmulationEnabled",
        commandParams: { enabled: true },
        timeoutMs: remainingCdpTimeout(options),
        preserveDebuggerOnTimeout: options.preserveDebuggerOnTimeout,
      });
    } catch (error) {
      if (isDeadlineError(error)) throw error;
    }
  },
  async enableOopifAutoAttachForTarget(
    this: CdpAttachmentOwner,
    target: CdpTarget,
    options: CdpDispatchOptions = {},
  ) {
    const params = {
        autoAttach: true,
        flatten: true,
        waitForDebuggerOnStart: false,
      },
      timeoutMs = dispatchTimeout(options);
    try {
      await this.api.executeCdp({
        target,
        method: "Target.setAutoAttach",
        commandParams: {
          ...params,
          filter: [{ type: "iframe", exclude: false }],
        },
        timeoutMs,
        preserveDebuggerOnTimeout: options.preserveDebuggerOnTimeout,
      });
    } catch (error) {
      if (isDeadlineError(error)) throw error;
      const retryTimeout = dispatchTimeout(options);
      try {
        await this.api.executeCdp({
          target,
          method: "Target.setAutoAttach",
          commandParams: params,
          timeoutMs: retryTimeout,
          preserveDebuggerOnTimeout: options.preserveDebuggerOnTimeout,
        });
      } catch (retryError) {
        if (isDeadlineError(retryError)) throw retryError;
        assertCdpDeadline(options);
      }
    }
  },
};
