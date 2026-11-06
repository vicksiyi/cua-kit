import type { CdpTarget } from "../cdp/dispatch_helpers";
import {
  accessibilityDocumentKey,
  accessibilityTargetKey,
  startNavigation,
} from "./navigation_state";
import type { NavigationState } from "./navigation_state";
export interface AXFrame {
  frameId: string;
  parentFrameId?: string;
  loaderId?: string;
  target: CdpTarget;
  ownerBackendNodeId?: number;
  size?: { width: number; height: number };
}
export interface AXActionTarget {
  target: CdpTarget;
  backendNodeId: number;
  frameId: string;
  loaderId?: string;
  actionDescriptions?: string[];
  isOptionElement?: boolean;
  javaScriptDialog?: { dialogID: string; control: string };
}
export interface AXRevision {
  identityForElement(id: number): string | null | undefined;
  isValueSettableForElement?(id: number): boolean | undefined;
  text: string;
}
export interface AXTabState extends NavigationState {
  tabId: number;
  initialized: boolean;
  enabledTargets: Set<string>;
  frames: Map<string, AXFrame>;
  targets: Map<string, AXActionTarget>;
  mainFrameId?: string;
  loaderId?: string;
  documentKey?: string;
  snapshotId?: string;
  accessibilityRevision?: AXRevision;
  pendingError?: unknown;
  pendingNavigationState?: NavigationState;
  lastAXUpdateMilliseconds?: number;
  provisionalNavigation?: Pick<
    NavigationState,
    "navigationRevision" | "committed" | "painted" | "tabStatus" | "documentId"
  >;
}
export interface AXStateCdp {
  getJsDialog(tabId: number): { id: string; type: string } | undefined;
  on(event: string, listener: (event: any) => void): unknown;
  removeListener(event: string, listener: (event: any) => void): unknown;
  addTabCleanupHandler(handler: (tabId: number) => void): () => void;
}
const paintEvents = new Set([
  "firstMeaningfulPaint",
  "firstContentfulPaint",
  "firstPaint",
  "firstImagePaint",
]);
/** Original iu. */
export class StaleAccessibilityCaptureError extends Error {
  constructor() {
    super("Accessibility capture belongs to a previous page");
  }
}
/** State/event portion of original Kh. Capture and tracking methods are restored separately, not replaced by stubs. */
export class AccessibilityStateStore {
  sessions = new Map<string, Map<number, AXTabState>>();
  captureProvenance = new WeakMap<
    object,
    { sessionId: string; documentKey: string; state: AXTabState }
  >();
  removeTabCleanupHandler?: () => void;
  constructor(
    public cdp: AXStateCdp,
    public getSessionId: () => string,
    observeNavigations = true,
  ) {
    if (observeNavigations) this.startObserving();
  }
  currentState(tabId: number): AXTabState {
    const sessionId = this.getSessionId();
    let tabs = this.sessions.get(sessionId);
    if (tabs == null) {
      tabs = new Map();
      this.sessions.set(sessionId, tabs);
    }
    let state = tabs.get(tabId);
    if (state == null) {
      state = {
        tabId,
        initialized: false,
        revision: 0,
        navigationRevision: 0,
        loading: false,
        committed: false,
        painted: false,
        enabledTargets: new Set(),
        frames: new Map(),
        targets: new Map(),
      };
      tabs.set(tabId, state);
    }
    return state;
  }
  startObserving() {
    if (this.removeTabCleanupHandler == null) {
      this.cdp.on("event", this.handleCdpEvent);
      this.cdp.on("tabDetached", this.handleTabDetached);
      this.removeTabCleanupHandler = this.cdp.addTabCleanupHandler((tabId) => {
        this.handleTabDetached(tabId);
      });
    }
  }
  dispose() {
    if (this.removeTabCleanupHandler != null) {
      this.cdp.removeListener("event", this.handleCdpEvent);
      this.cdp.removeListener("tabDetached", this.handleTabDetached);
      this.removeTabCleanupHandler();
    }
    this.sessions.clear();
  }
  navigationState(state: AXTabState) {
    return {
      tabId: state.tabId,
      revision: state.revision,
      navigationRevision: state.navigationRevision,
      loading: state.loading,
      committed: state.committed,
      painted: state.painted,
      tabStatus: state.tabStatus,
      url: state.url,
      documentId: state.loaderId,
      javaScriptDialogId: this.cdp.getJsDialog(state.tabId)?.id,
      lastAXUpdateMilliseconds: state.lastAXUpdateMilliseconds,
    };
  }
  markActionCompleted(tabId: number, navigation: NavigationState) {
    const state = this.currentState(tabId);
    state.pendingNavigationState = navigation;
    this.throwPendingError(tabId);
  }
  targetForElement(tabId: number, id: number) {
    const state = this.currentState(tabId),
      identity = state.accessibilityRevision?.identityForElement(id),
      target = identity == null ? undefined : state.targets.get(identity);
    if (
      target == null ||
      (target.javaScriptDialog != null &&
        this.cdp.getJsDialog(tabId)?.id !== target.javaScriptDialog.dialogID)
    )
      throw new Error(`Accessibility element ${id} is stale or missing`);
    if (
      state.documentKey !==
      accessibilityDocumentKey(state.mainFrameId, state.loaderId)
    )
      throw new Error(`Accessibility element ${id} belongs to a previous page`);
    return {
      ...target,
      id,
      isValueSettable:
        state.accessibilityRevision?.isValueSettableForElement?.(id),
    };
  }
  targetForSnapshot(tabId: number, snapshotId: string, elementIndex: number) {
    const state = this.currentState(tabId);
    if (state.snapshotId !== snapshotId)
      throw new StaleAccessibilityCaptureError();
    const target = this.targetForElement(tabId, elementIndex);
    if (target.frameId !== state.mainFrameId || target.javaScriptDialog != null)
      throw new StaleAccessibilityCaptureError();
    return target;
  }
  discardCapture(tabId: number, capture: { snapshotId?: string }) {
    const state = this.sessions.get(this.getSessionId())?.get(tabId);
    if (state != null && capture.snapshotId === state.snapshotId) {
      state.accessibilityRevision = undefined;
      state.snapshotId = undefined;
      state.targets.clear();
    }
  }
  frameForId(tabId: number, frameId: string) {
    return this.currentState(tabId).frames.get(frameId);
  }
  trackDeferredPageLoad(tabId: number, promise: Promise<unknown>) {
    const state = this.currentState(tabId);
    promise.catch((error) => {
      state.pendingError ??= error;
    });
  }
  throwPendingError(tabId: number) {
    const state = this.currentState(tabId);
    if (state.pendingError == null) return;
    const error = state.pendingError;
    state.pendingError = undefined;
    throw error;
  }
  validateCapture(tabId: number, capture: { snapshotId?: string }) {
    const sessionId = this.getSessionId(),
      state = this.sessions.get(sessionId)?.get(tabId);
    if (state != null) this.throwPendingError(tabId);
    const provenance = this.captureProvenance.get(capture);
    if (
      provenance != null &&
      (state == null ||
        provenance.state !== state ||
        provenance.sessionId !== sessionId ||
        (capture.snapshotId != null &&
          capture.snapshotId !== state.snapshotId) ||
        provenance.documentKey !==
          accessibilityDocumentKey(state.mainFrameId, state.loaderId))
    )
      throw new StaleAccessibilityCaptureError();
  }
  /** Original Kh.commitCapture: commit only within the current session and document. */
  commitCapture(
    state: AXTabState,
    capture: {
      documentKey: string;
      candidate?: {
        documentKey: string;
        frames: Map<string, AXFrame>;
        targets: Map<string, AXActionTarget>;
        accessibilityRevision: AXRevision;
        tab: { id: number; title?: string | null; url?: string | null };
        url?: string;
        rendered: string;
      };
      data?: unknown;
      screenshotUnavailable?: string;
    },
  ) {
    this.throwPendingError(state.tabId);
    if (this.sessions.get(this.getSessionId())?.get(state.tabId) !== state)
      throw new StaleAccessibilityCaptureError();
    const candidate = capture.candidate,
      documentKey = accessibilityDocumentKey(state.mainFrameId, state.loaderId);
    if (
      capture.documentKey !== documentKey ||
      (candidate != null && candidate.documentKey !== documentKey)
    )
      return;
    if (candidate != null) {
      state.documentKey = candidate.documentKey;
      state.frames = candidate.frames;
      state.targets = candidate.targets;
      state.accessibilityRevision = candidate.accessibilityRevision;
      state.snapshotId = crypto.randomUUID();
      state.pendingNavigationState = undefined;
    }
    let rendered: string | undefined;
    if (candidate != null) {
      const tab = candidate.tab,
        instruction =
          candidate.url != null && candidate.url === tab.url
            ? this.getSiteInstruction?.(tab.id, candidate.url)
            : undefined;
      const suffix = instruction
        ? `, Site Specific Instructions: ${JSON.stringify(instruction)}`
        : "";
      rendered = `Browser tab: ${tab.id}, Title: ${JSON.stringify(tab.title ?? "Unknown")}, URL: ${JSON.stringify(tab.url ?? "Unknown")}${suffix}.\n${candidate.rendered}`;
    }
    const result = {
      ...(rendered == null
        ? {}
        : { state: rendered, snapshotId: state.snapshotId }),
      ...(capture.data == null ? {} : { data: capture.data }),
      ...(capture.screenshotUnavailable == null
        ? {}
        : { screenshot_unavailable: capture.screenshotUnavailable }),
    };
    this.captureProvenance.set(result, {
      sessionId: this.getSessionId(),
      documentKey: capture.documentKey,
      state,
    });
    return result;
  }
  getSiteInstruction?: (tabId: number, url: string) => unknown;
  invalidateFrame(state: AXTabState, frameId: string) {
    const invalid = new Set([frameId]);
    for (const [id, frame] of state.frames)
      if (frame.parentFrameId != null && invalid.has(frame.parentFrameId))
        invalid.add(id);
    for (const id of invalid) state.frames.delete(id);
    for (const [id, target] of state.targets)
      if (invalid.has(target.frameId)) state.targets.delete(id);
  }
  handleCdpEvent = (event: {
    source: CdpTarget;
    method: string;
    params: any;
  }) => {
    let state: AXTabState | undefined;
    try {
      state = this.sessions.get(this.getSessionId())?.get(event.source.tabId);
    } catch {
      return;
    }
    if (state == null) {
      if (
        event.method !== "Page.frameNavigated" ||
        event.source.sessionId != null ||
        event.source.targetId != null ||
        event.params.frame.parentId != null
      )
        return;
      state = this.currentState(event.source.tabId);
      state.pendingNavigationState = this.navigationState(state);
    }
    if (
      event.method === "Accessibility.loadComplete" ||
      event.method === "Accessibility.nodesUpdated"
    ) {
      if (!state.enabledTargets.has(accessibilityTargetKey(event.source)))
        return;
      state.lastAXUpdateMilliseconds = Date.now();
      return;
    }
    if (
      event.method === "Page.frameNavigated" &&
      (event.source.sessionId != null ||
        event.source.targetId != null ||
        event.params.frame.parentId != null)
    ) {
      this.invalidateFrame(state, event.params.frame.id);
      return;
    }
    if (event.method === "Page.frameDetached") {
      this.invalidateFrame(state, event.params.frameId);
      return;
    }
    if (event.method === "Target.detachedFromTarget") {
      const target = { tabId: state.tabId, sessionId: event.params.sessionId };
      state.enabledTargets.delete(accessibilityTargetKey(target));
      for (const frame of state.frames.values())
        if (frame.target.sessionId === target.sessionId)
          this.invalidateFrame(state, frame.frameId);
      return;
    }
    if (
      event.method === "Page.javascriptDialogOpening" ||
      event.method === "Page.javascriptDialogClosed"
    ) {
      state.revision++;
      return;
    }
    if (event.source.sessionId != null || event.source.targetId != null) return;
    switch (event.method) {
      case "Page.frameStartedLoading":
        if (event.params.frameId === state.mainFrameId) {
          if (!state.loading)
            state.provisionalNavigation = {
              navigationRevision: state.navigationRevision,
              committed: state.committed,
              painted: state.painted,
              tabStatus: state.tabStatus,
              documentId: state.loaderId,
            };
          startNavigation(state);
        }
        break;
      case "Page.frameNavigated":
        state.pendingNavigationState ??= this.navigationState(state);
        state.provisionalNavigation = undefined;
        if (!state.loading) startNavigation(state);
        state.mainFrameId = event.params.frame.id;
        state.loaderId = event.params.frame.loaderId;
        state.url = event.params.frame.url;
        state.committed = true;
        if (event.params.type === "BackForwardCacheRestore") {
          state.loading = false;
          state.painted = true;
        }
        break;
      case "Page.navigatedWithinDocument":
        if (event.params.frameId === state.mainFrameId) {
          const provisional = state.provisionalNavigation;
          if (
            provisional != null &&
            provisional.documentId === state.loaderId
          ) {
            state.revision--;
            state.navigationRevision = provisional.navigationRevision;
            state.committed = provisional.committed;
            state.painted = provisional.painted;
            state.tabStatus = provisional.tabStatus;
            state.provisionalNavigation = undefined;
          }
          state.loading = false;
          state.url = event.params.url;
          if (event.params.navigationType === "fragment") break;
          state.pendingNavigationState ??= this.navigationState(state);
          state.revision++;
        }
        break;
      case "Page.domContentEventFired":
        state.loading = false;
        break;
      case "Page.loadEventFired":
        state.loading = false;
        state.tabStatus = "complete";
        break;
      case "Page.frameStoppedLoading":
        if (event.params.frameId === state.mainFrameId) state.loading = false;
        break;
      case "Page.lifecycleEvent":
        if (
          state.committed &&
          event.params.frameId === state.mainFrameId &&
          (state.loaderId == null ||
            event.params.loaderId === state.loaderId) &&
          paintEvents.has(event.params.name)
        )
          state.painted = true;
        break;
    }
  };
  handleTabDetached = (tabId: number) => {
    for (const tabs of this.sessions.values()) tabs.delete(tabId);
  };
}
