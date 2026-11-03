import { classifyCommandError } from "../classify_error";
import {
  assertCdpDeadline,
  dispatchTimeout,
  prepareCdpDispatch,
  tabAttachmentSetup,
  type CdpDeadlineOptions,
} from "./deadline";
import {
  isNestedTarget,
  cdpDomain,
  rawCdpTelemetry,
  evaluationTelemetry,
  hasCdpExpression,
  type CdpTarget,
} from "./dispatch_helpers";
export interface CdpDispatchOptions extends CdpDeadlineOptions {
  preserveDebuggerOnTimeout?: boolean;
  prepareDispatch?: () => Promise<unknown>;
  telemetryAttrs?: Record<string, unknown>;
  expressionCacheKey?: string;
  target?: { sessionId?: string; targetId?: string };
  [tabAttachmentSetup]?: number;
}
export interface CdpExecutionOwner {
  api: {
    executeCdp(payload: unknown): Promise<any>;
    executeCdpWithCachedExpression(payload: unknown, key: string): Promise<any>;
  };
  performanceSpan: {
    withSpan<T>(
      name: string,
      attributes: Record<string, unknown>,
      run: () => Promise<T>,
    ): Promise<T>;
    currentCommandAttrs(): Record<string, unknown>;
  };
  attachedTabIds: Set<number>;
  tabAttachmentPromises: Map<number, Promise<unknown>>;
  rawScreencastTabIds: Set<number>;
  documentTarget?: CdpTarget;
  frameSessionsBySessionId: Map<string, { target: CdpTarget }>;
  frameSessionsByTabId: Map<number, Map<string, { target: CdpTarget }>>;
  throwIfJsDialogBlocksMethod(tabId: number, method: string): void;
  waitForTabAttachment(
    tabId: number,
    options: CdpDispatchOptions,
  ): Promise<unknown>;
  forgetAttachedTab(tabId: number): unknown;
  executeTargetCdp(
    target: CdpTarget,
    method: string,
    params?: unknown,
    options?: CdpDispatchOptions,
    retry?: boolean,
  ): Promise<any>;
  callTarget(
    target: CdpTarget,
    method: string,
    params?: unknown,
    options?: CdpDispatchOptions,
  ): Promise<any>;
  rawCdpTarget(
    tabId: number,
    target?: { sessionId?: string; targetId?: string },
  ): CdpTarget;
  withScreencastLock<T>(tabId: number, run: () => Promise<T>): Promise<T>;
}
/** Original qh call/target/dispatch group; Dt telemetry reporting remains an explicit dependency.
 * Attachment, dialog and provider APIs must be supplied by the actual manager, not fallback implementations.
 */
export function createCdpExecutionMethods(
  reportError: (
    error: Error,
    context: { tags: Record<string, string> },
  ) => unknown,
) {
  return {
    async call(
      this: CdpExecutionOwner,
      tabId: unknown,
      method: string,
      params?: unknown,
      options: CdpDispatchOptions = {},
    ) {
      const id = Number(tabId);
      if (!Number.isFinite(id))
        throw new Error("callCdp requires numeric tab_id");
      return await this.callTarget({ tabId: id }, method, params, options);
    },
    async callTarget(
      this: CdpExecutionOwner,
      target: CdpTarget,
      method: string,
      params?: unknown,
      options: CdpDispatchOptions = {},
    ) {
      return await this.executeTargetCdp(target, method, params, options);
    },
    async callRawCdp(
      this: CdpExecutionOwner,
      tabId: unknown,
      method: string,
      params?: unknown,
      options: CdpDispatchOptions = {},
    ) {
      const id = Number(tabId);
      if (!Number.isFinite(id))
        throw new Error("callRawCdp requires numeric tab_id");
      const { target, ...rest } = options,
        actual = this.rawCdpTarget(id, target),
        execute = async () =>
          await this.executeTargetCdp(actual, method, params, {
            ...rest,
            preserveDebuggerOnTimeout: true,
            telemetryAttrs: rawCdpTelemetry(rest.telemetryAttrs),
          });
      return !isNestedTarget(actual) &&
        (method === "Page.startScreencast" || method === "Page.stopScreencast")
        ? await this.withScreencastLock(id, async () => {
            const result = await execute();
            if (method === "Page.startScreencast")
              this.rawScreencastTabIds.add(id);
            else this.rawScreencastTabIds.delete(id);
            return result;
          })
        : await execute();
    },
    forDocument(this: CdpExecutionOwner, target: CdpTarget) {
      return Object.create(this, { documentTarget: { value: target } });
    },
    async executeTargetCdp(
      this: CdpExecutionOwner,
      target: CdpTarget,
      method: string,
      params?: unknown,
      options: CdpDispatchOptions = {},
      retry = true,
    ): Promise<any> {
      this.throwIfJsDialogBlocksMethod(target.tabId, method);
      assertCdpDeadline(options);
      const canRetry =
        retry &&
        !isNestedTarget(target) &&
        options[tabAttachmentSetup] !== target.tabId;
      try {
        await this.waitForTabAttachment(target.tabId, options);
      } catch (error) {
        if (error === "Debugger unattached" && canRetry)
          return await this.executeTargetCdp(
            target,
            method,
            params,
            options,
            false,
          );
        throw error;
      }
      if (options.prepareDispatch != null)
        await prepareCdpDispatch(options, options.prepareDispatch);
      return await this.performanceSpan.withSpan(
        "browser_use.cdp.execute",
        {
          "browser_use.cdp.domain": cdpDomain(method),
          "browser_use.cdp.method": method,
          "browser_use.tab.id": target.tabId,
          "tab.id": target.tabId,
          ...this.performanceSpan.currentCommandAttrs(),
          ...evaluationTelemetry(method, params),
          ...options.telemetryAttrs,
        },
        async () => {
          const attached = this.attachedTabIds.has(target.tabId)
              ? this.tabAttachmentPromises.get(target.tabId)
              : undefined,
            timeoutMs = dispatchTimeout(options);
          try {
            const request = {
              target:
                this.documentTarget?.tabId === target.tabId &&
                !isNestedTarget(target)
                  ? this.documentTarget
                  : target,
              method,
              commandParams: params ?? {},
              ...(options.preserveDebuggerOnTimeout === true
                ? { preserveDebuggerOnTimeout: true }
                : {}),
              timeoutMs,
            };
            if (options.expressionCacheKey == null)
              return await this.api.executeCdp(request);
            if (!hasCdpExpression(params))
              throw new Error("Cached CDP execution requires an expression");
            return await this.api.executeCdpWithCachedExpression(
              { ...request, commandParams: params },
              options.expressionCacheKey,
            );
          } catch (error) {
            if (
              error === "Debugger unattached" ||
              (typeof error === "string" &&
                error.includes("Debugger is not attached"))
            ) {
              if (
                attached != null &&
                this.tabAttachmentPromises.get(target.tabId) === attached
              )
                this.forgetAttachedTab(target.tabId);
              if (canRetry)
                return this.executeTargetCdp(
                  target,
                  method,
                  params,
                  options,
                  false,
                );
            }
            if (classifyCommandError(error) === "cdp_timeout") {
              const timeout = new Error("Browser Use CDP command timed out");
              timeout.name = "CdpCommandTimeoutError";
              const full =
                options.telemetryAttrs?.["browser_use.cdp.method"] === "full";
              reportError(timeout, {
                tags: {
                  "browser_use.cdp.domain": full ? "full" : cdpDomain(method),
                  "browser_use.cdp.method": full ? "full" : method,
                  "browser_use.cdp.target_type": isNestedTarget(target)
                    ? "nested"
                    : "tab",
                },
              });
            }
            throw error;
          }
        },
      );
    },
    rawCdpTarget(
      this: CdpExecutionOwner,
      tabId: number,
      target?: { sessionId?: string; targetId?: string },
    ): CdpTarget {
      if (target?.sessionId != null && target.targetId != null)
        throw new Error(
          "CDP target must provide either sessionId or targetId, not both.",
        );
      if (target?.sessionId != null) {
        const session = this.frameSessionsBySessionId.get(target.sessionId);
        if (session?.target.tabId !== tabId)
          throw new Error(
            `CDP session ${target.sessionId} is not attached to tab ${tabId}.`,
          );
        return session.target;
      }
      if (target?.targetId != null) {
        const session = this.frameSessionsByTabId
          .get(tabId)
          ?.get(target.targetId);
        if (session == null)
          throw new Error(
            `CDP target ${target.targetId} is not attached to tab ${tabId}.`,
          );
        return session.target;
      }
      return { tabId };
    },
  };
}
