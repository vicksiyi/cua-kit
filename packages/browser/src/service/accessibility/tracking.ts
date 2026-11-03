import { AccessibilityStateStore } from "./state_store";
import type { AXStateCdp, AXTabState } from "./state_store";
import type { CdpTarget } from "../cdp/dispatch_helpers";
import {
  accessibilityDocumentKey,
  accessibilityTargetKey,
} from "./navigation_state";
import type { NavigationState } from "./navigation_state";
import { raceJavaScriptDialog } from "./action_coordinator";
import type { DialogCdp } from "./action_coordinator";
export type AXTrackingCdp = AXStateCdp &
  DialogCdp & {
    call(tabId: number, method: string, params?: object): Promise<any>;
    callTarget(
      target: CdpTarget,
      method: string,
      params?: object,
      options?: object,
    ): Promise<any>;
    readDocumentState(
      tabId: number,
      options: { includePaint: boolean },
    ): Promise<
      { href?: string; painted?: boolean; readyState?: string } | undefined
    >;
    evaluateJavascript(tabId: number, expression: string): Promise<any>;
  };
export interface AXPerformanceSpan {
  withSpan<T>(
    name: string,
    attributes: Record<string, unknown>,
    run: () => Promise<T>,
  ): Promise<T>;
}
/** Original K2: tracing is pass-through when no telemetry implementation is supplied. */
export const defaultAXPerformanceSpan = {
  async withSpan<T>(
    _name: string,
    _attributes: Record<string, unknown>,
    run: () => Promise<T>,
  ): Promise<T> {
    return await run();
  },
  async withCommandTelemetry<T>(
    _name: string,
    _attributes: Record<string, unknown>,
    run: () => Promise<T>,
  ): Promise<T> {
    return await run();
  },
  currentCommandAttrs() {
    return {};
  },
  currentPlaywrightOperation<T>(operation: T) {
    return operation;
  },
};
/** Original Ji. */
export async function waitAXMilliseconds(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
/** Tracking/action/wait portion of Kh, over its restored state store. */
export class AccessibilityTracking extends AccessibilityStateStore {
  declare cdp: AXTrackingCdp;
  performanceSpan: AXPerformanceSpan;
  constructor(
    cdp: AXTrackingCdp,
    getSessionId: () => string,
    public actions: { perform(tabId: number, action: any): Promise<unknown> },
    options: {
      observeNavigations?: boolean;
      performanceSpan?: AXPerformanceSpan;
    } = {},
  ) {
    super(cdp, getSessionId, false);
    this.performanceSpan = options.performanceSpan ?? defaultAXPerformanceSpan;
    if (options.observeNavigations !== false) this.startObserving();
  }
  async prepareAction(tabId: number) {
    const state = await this.ensureTracked(tabId);
    this.throwPendingError(tabId);
    return this.navigationState(state);
  }
  async performAction(tabId: number, action: any) {
    const previous = await this.prepareAction(tabId);
    await this.actions.perform(tabId, action);
    if (
      (action.kind === "set_value" || action.kind === "type_text") &&
      this.cdp.getJsDialog(tabId)?.type === "prompt"
    )
      this.currentState(tabId).revision++;
    this.markActionCompleted(tabId, previous);
  }
  async ensureTracked(tabId: number): Promise<AXTabState> {
    this.startObserving();
    const state = this.currentState(tabId);
    return state.initialized
      ? state
      : await raceJavaScriptDialog(
          this.cdp,
          tabId,
          async () => {
            const revision = state.navigationRevision,
              documentKey = accessibilityDocumentKey(
                state.mainFrameId,
                state.loaderId,
              ),
              { frameTree } = await this.cdp.call(tabId, "Page.getFrameTree");
            if (
              (!state.loading || state.committed) &&
              state.navigationRevision === revision &&
              accessibilityDocumentKey(state.mainFrameId, state.loaderId) ===
                documentKey
            ) {
              state.mainFrameId = frameTree.frame.id;
              state.loaderId = frameTree.frame.loaderId;
              state.url = frameTree.frame.url;
              state.committed = true;
            }
            await Promise.all([
              this.enableAccessibility(state, { tabId }),
              this.cdp.call(tabId, "Page.setLifecycleEventsEnabled", {
                enabled: true,
              }),
            ]);
            if (state.committed && this.cdp.getJsDialog(tabId) == null) {
              const key = accessibilityDocumentKey(
                  state.mainFrameId,
                  state.loaderId,
                ),
                navigationRevision = state.navigationRevision,
                document = await this.cdp.readDocumentState(tabId, {
                  includePaint: true,
                });
              if (
                state.committed &&
                state.navigationRevision === navigationRevision &&
                accessibilityDocumentKey(state.mainFrameId, state.loaderId) ===
                  key
              ) {
                if (document?.href != null) state.url = document.href;
                if (document?.painted === true) state.painted = true;
                if (document?.readyState === "complete") {
                  state.tabStatus = "complete";
                  state.painted = true;
                } else if (document?.readyState != null) {
                  state.loading = true;
                  state.tabStatus = "loading";
                }
              }
            }
            state.initialized = true;
            return state;
          },
          () => state,
        );
  }
  async enableAccessibility(
    state: AXTabState,
    target: CdpTarget,
    options?: object,
  ) {
    const key = accessibilityTargetKey(target);
    if (!state.enabledTargets.has(key)) {
      await this.cdp.callTarget(
        target,
        "Accessibility.enable",
        undefined,
        options,
      );
      state.enabledTargets.add(key);
    }
  }
  async waitForNavigation(state: AXTabState, previous: NavigationState) {
    return await this.performanceSpan.withSpan(
      "browser_use.ax.wait_for_navigation",
      { "tab.id": state.tabId },
      () => this.pollForNavigation(state, previous),
    );
  }
  async pollForNavigation(state: AXTabState, previous: NavigationState) {
    const started = Date.now();
    let current = previous;
    if (!previous.loading)
      while (Date.now() - started < 25) {
        this.throwPendingError(state.tabId);
        current = this.navigationState(state);
        if (current.loading || current.revision !== previous.revision) break;
        await waitAXMilliseconds(10);
      }
    if (!current.loading || current.committed) return current;
    while (Date.now() - started < 5000) {
      this.throwPendingError(state.tabId);
      current = this.navigationState(state);
      if (!current.loading || current.committed) return current;
      await waitAXMilliseconds(10);
    }
    return current;
  }
  async waitForFirstPaint(state: AXTabState, previous: NavigationState) {
    return await this.performanceSpan.withSpan(
      "browser_use.ax.wait_for_first_paint",
      { "tab.id": state.tabId },
      () => this.pollForFirstPaint(state, previous),
    );
  }
  async pollForFirstPaint(state: AXTabState, previous: NavigationState) {
    if (
      !previous.committed ||
      previous.painted ||
      previous.javaScriptDialogId != null
    )
      return previous;
    const deadline = Date.now() + 5000;
    let current = previous;
    while (Date.now() < deadline) {
      this.throwPendingError(state.tabId);
      current = this.navigationState(state);
      if (current.painted || current.tabStatus === "complete") return current;
      await waitAXMilliseconds(10);
    }
    return current;
  }
  async waitForAXQuiet(
    state: AXTabState,
    previous: NavigationState & { lastAXUpdateMilliseconds?: number },
    navigated: boolean,
  ) {
    return await this.performanceSpan.withSpan(
      "browser_use.ax.wait_for_quiet",
      { "tab.id": state.tabId },
      () => this.pollForAXQuiet(state, previous, navigated),
    );
  }
  async pollForAXQuiet(
    state: AXTabState,
    previous: NavigationState & { lastAXUpdateMilliseconds?: number },
    navigated: boolean,
  ) {
    const started = Date.now(),
      deadline = started + 750,
      quietMilliseconds = navigated ? 50 : 100;
    let current = previous;
    for (;;) {
      this.throwPendingError(state.tabId);
      const lastUpdate = Math.max(
        started,
        current.lastAXUpdateMilliseconds ?? started,
      );
      if (
        Date.now() - lastUpdate >= quietMilliseconds ||
        Date.now() >= deadline
      )
        return current;
      await waitAXMilliseconds(25);
      current = this.navigationState(state);
    }
  }
  async probeNavigationState(state: AXTabState) {
    const current = this.navigationState(state);
    if (current.javaScriptDialogId != null) return current;
    const document = await this.cdp
      .evaluateJavascript(
        state.tabId,
        "(() => { const body = document.body; return { readyState: document.readyState, elementCount: body?.querySelectorAll('*').length ?? 0, textLength: body?.innerText?.length ?? 0 }; })()",
      )
      .catch(() => {});
    return {
      ...current,
      documentElementCount: document?.elementCount,
      documentTextLength: document?.textLength,
      tabStatus:
        document?.readyState === "complete" ? "complete" : current.tabStatus,
    };
  }
}
