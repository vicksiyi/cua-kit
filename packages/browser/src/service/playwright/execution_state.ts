import type { CdpTarget } from "../cdp/dispatch_helpers";
import { LocatorError } from "../errors/locator_error";
export interface ExecutionOptions {
  deadlineMs?: number;
  timeoutMs?: number;
  [name: string]: unknown;
}
export interface ExecutionCdp {
  addListener(event: string, listener: (event: any) => void): unknown;
  call(
    tabId: number,
    method: string,
    params?: object,
    options?: ExecutionOptions,
  ): Promise<any>;
  callTarget?(
    target: CdpTarget,
    method: string,
    params?: object,
    options?: ExecutionOptions,
  ): Promise<any>;
}
/** Original Fo/ng/og. */
export function executionTargetKey(target: CdpTarget, frameId?: string) {
  const suffix = frameId == null ? "" : `:${frameId}`;
  return target.sessionId != null
    ? `${target.tabId}:${target.sessionId}${suffix}`
    : target.targetId != null
      ? `${target.tabId}:${target.targetId}${suffix}`
      : `${target.tabId}${suffix}`;
}
export function executionTargetAliases(target: CdpTarget) {
  const keys = [
    ...(target.sessionId == null
      ? []
      : [`${target.tabId}:${target.sessionId}`]),
    ...(target.targetId == null ? [] : [`${target.tabId}:${target.targetId}`]),
  ];
  return keys.length === 0 ? [String(target.tabId)] : keys;
}
export function targetKeyMatches(key: string, prefix: string) {
  return key === prefix || key.startsWith(`${prefix}:`);
}
/** Original ot. */
export function assertSelectorDeadline(options: ExecutionOptions) {
  if (options.deadlineMs != null && Date.now() >= options.deadlineMs)
    throw new LocatorError(
      "selector_deadline_exceeded",
      "Playwright selector deadline exceeded",
    );
}
interface World {
  executionContextId: number;
}
/** State/context lifecycle portion of original ig; selector and injection operations follow separately. */
export class PlaywrightExecutionState {
  playwrightFrameWorlds = new Map<string, World>();
  readonlyExecutionContexts = new Map<
    string,
    { frameId?: string; targetKeys: string[]; context?: World }
  >();
  playwrightInjectedTargets = new Set<string>();
  boundSelector: unknown;
  beforeDocumentClick: unknown;
  static injectedConstant = "__codexPlaywrightInjected";
  constructor(public cdp: ExecutionCdp) {
    cdp.addListener("tabDetached", (tabId: number) => {
      this.clearReadonlyExecutionContexts({ tabId }, undefined);
      for (const key of this.playwrightInjectedTargets)
        if (key === String(tabId) || key.startsWith(`${tabId}:`))
          this.playwrightInjectedTargets.delete(key);
      for (const key of this.playwrightFrameWorlds.keys())
        if (key === String(tabId) || key.startsWith(`${tabId}:`))
          this.playwrightFrameWorlds.delete(key);
    });
    cdp.addListener("event", (event: any) => {
      if (
        event.method === "Runtime.executionContextsCleared" ||
        (event.method === "Page.frameNavigated" &&
          event.params.frame.parentId == null)
      ) {
        this.clearPlaywrightStateForTarget(event.source);
        this.clearReadonlyExecutionContexts(event.source, undefined);
      } else if (event.method === "Page.frameNavigated") {
        this.deletePlaywrightFrameWorld(event.source, event.params.frame.id);
        this.clearReadonlyExecutionContexts(
          event.source,
          event.params.frame.id,
        );
      } else if (event.method === "Page.frameDetached") {
        this.deletePlaywrightFrameWorld(event.source, event.params.frameId);
        this.clearReadonlyExecutionContexts(event.source, event.params.frameId);
      } else if (event.method === "Target.attachedToTarget")
        this.clearPlaywrightFrameWorldsForTarget(event.source);
      else if (event.method === "Target.detachedFromTarget")
        this.clearReadonlyExecutionContexts(
          {
            tabId: event.source.tabId,
            sessionId: event.params.sessionId,
            targetId: event.params.targetId,
          },
          undefined,
        );
    });
  }
  forDocument(cdp: ExecutionCdp, beforeDocumentClick: unknown): this {
    return Object.create(this, {
      cdp: { value: cdp },
      playwrightFrameWorlds: { value: new Map() },
      playwrightInjectedTargets: { value: new Set() },
      boundSelector: { value: undefined },
      beforeDocumentClick: { value: beforeDocumentClick },
    });
  }
  async getReadonlyExecutionContext(
    target: CdpTarget,
    frameId: string | undefined,
    create: () => Promise<number>,
  ): Promise<World> {
    const key = executionTargetKey(target, frameId);
    for (;;) {
      let entry = this.readonlyExecutionContexts.get(key);
      if (entry?.context != null) return entry.context;
      if (entry == null) {
        entry = {
          frameId,
          targetKeys: executionTargetAliases(target),
          context: undefined,
        };
        this.readonlyExecutionContexts.set(key, entry);
      }
      let id: number;
      try {
        id = await create();
      } catch (error) {
        if (this.readonlyExecutionContexts.get(key) !== entry) continue;
        if (entry.context == null) this.readonlyExecutionContexts.delete(key);
        throw error;
      }
      if (this.readonlyExecutionContexts.get(key) === entry) {
        entry.context ??= { executionContextId: id };
        if (this.readonlyExecutionContexts.size > 20)
          for (const [oldKey, oldEntry] of this.readonlyExecutionContexts)
            if (oldEntry !== entry && oldEntry.context != null) {
              this.readonlyExecutionContexts.delete(oldKey);
              break;
            }
        return entry.context;
      }
    }
  }
  invalidateReadonlyExecutionContext(
    target: CdpTarget,
    frameId: string | undefined,
    context: World,
  ) {
    const key = executionTargetKey(target, frameId);
    if (this.readonlyExecutionContexts.get(key)?.context === context)
      this.readonlyExecutionContexts.delete(key);
  }
  async playwrightFrameWorld(
    target: CdpTarget,
    frameId: string,
    options: ExecutionOptions = {},
  ): Promise<World> {
    const key = executionTargetKey(target, frameId),
      cached = this.playwrightFrameWorlds.get(key);
    if (cached != null) return cached;
    assertSelectorDeadline(options);
    const world = {
      executionContextId: (
        await this.callCdpTarget(
          target,
          "Page.createIsolatedWorld",
          {
            frameId,
            grantUniveralAccess: false,
            worldName: "browser-use-playwright",
          },
          options,
        )
      ).executionContextId,
    };
    this.playwrightFrameWorlds.set(key, world);
    if (this.playwrightFrameWorlds.size > 50) {
      const first = this.playwrightFrameWorlds.keys().next().value;
      if (first != null) {
        this.playwrightFrameWorlds.delete(first);
        this.playwrightInjectedTargets.delete(first);
      }
    }
    return world;
  }
  async callRuntimeEvaluateInExecutionTarget(
    scope: { target: CdpTarget; frameId?: string },
    params: object,
    options: ExecutionOptions = {},
    expressionCacheKey?: unknown,
  ) {
    assertSelectorDeadline(options);
    const contextId =
      scope.frameId == null
        ? undefined
        : (
            await this.playwrightFrameWorld(
              scope.target,
              scope.frameId,
              options,
            )
          ).executionContextId;
    assertSelectorDeadline(options);
    return {
      ...(await this.callCdpTarget(
        scope.target,
        "Runtime.evaluate",
        { ...params, ...(contextId == null ? {} : { contextId }) },
        { ...options, expressionCacheKey },
      )),
      executionContextId: contextId,
    };
  }
  clearReadonlyExecutionContexts(target: CdpTarget, frameId?: string) {
    const aliases = executionTargetAliases(target);
    for (const [key, entry] of this.readonlyExecutionContexts)
      if (
        (frameId == null || entry.frameId === frameId) &&
        aliases.some((alias) =>
          entry.targetKeys.some((key) => targetKeyMatches(key, alias)),
        )
      )
        this.readonlyExecutionContexts.delete(key);
  }
  deletePlaywrightFrameWorld(target: CdpTarget, frameId: string) {
    const key = executionTargetKey(target, frameId);
    this.playwrightFrameWorlds.delete(key);
    this.playwrightInjectedTargets.delete(key);
  }
  clearPlaywrightFrameWorldsForTarget(target: CdpTarget) {
    const aliases = executionTargetAliases(target);
    for (const key of this.playwrightFrameWorlds.keys())
      if (aliases.some((alias) => targetKeyMatches(key, alias))) {
        this.playwrightFrameWorlds.delete(key);
        this.playwrightInjectedTargets.delete(key);
      }
  }
  clearPlaywrightStateForTarget(target: CdpTarget) {
    const aliases = executionTargetAliases(target);
    for (const key of this.playwrightInjectedTargets)
      if (aliases.some((alias) => targetKeyMatches(key, alias)))
        this.playwrightInjectedTargets.delete(key);
    for (const key of this.playwrightFrameWorlds.keys())
      if (aliases.some((alias) => targetKeyMatches(key, alias)))
        this.playwrightFrameWorlds.delete(key);
  }
  async callCdpTarget(
    target: CdpTarget,
    method: string,
    params?: object,
    options: ExecutionOptions = {},
  ) {
    const cdp = this.cdp;
    return typeof cdp.callTarget === "function"
      ? await cdp.callTarget(target, method, params, options)
      : await this.cdp.call(target.tabId, method, params, options);
  }
}
