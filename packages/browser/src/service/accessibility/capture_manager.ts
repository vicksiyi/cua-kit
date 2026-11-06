import { AccessibilityTracking, waitAXMilliseconds } from "./tracking";
import type { AXTrackingCdp, AXPerformanceSpan } from "./tracking";
import type { AXTabState, AXRevision, AXActionTarget } from "./state_store";
import {
  accessibilityDocumentKey,
  navigationChanged,
  needsCaptureRetry,
  isCaptureUsable,
} from "./navigation_state";
import { captureAXSessions, captureAXDocuments } from "./capture_documents";
import type {
  AXDocumentCollector,
  AXFrameTree,
  AXDOMSnapshot,
  AXCaptureSession,
} from "./capture_documents";
import { mergeAXDocuments, accessibilityNodeIdentity } from "./tree_conversion";
import { javaScriptDialogTree } from "./dialog_tree";
import { raceJavaScriptDialog } from "./action_coordinator";
import type { CdpTarget } from "../cdp/dispatch_helpers";
export interface AXCore {
  buildRevision(
    previous: any,
    snapshot: object,
    options: { mode: "full" | "auto" },
  ): AXRevision;
}
let runtime: AXCore | undefined;
let runtimePromise: Promise<void> | undefined;
/** Original Z2/Vre/Q2: shared lazy WASM runtime, including cached load rejection. */
export const defaultAccessibilityCore: AXCore = {
  buildRevision(previous, snapshot, options) {
    if (runtime == null)
      throw new Error(
        "Browser accessibility WebAssembly runtime is not loaded",
      );
    return runtime.buildRevision(previous, snapshot, options);
  },
};
export function setAccessibilityCore(core: AXCore) {
  runtime = core;
}
export function initializeAccessibilityCore(
  source?: URL | string | ArrayBuffer | Uint8Array,
  options?: { env?: Record<string, string | undefined> },
) {
  return (runtimePromise ??= Promise.resolve()
    .then(() => import("./wasm"))
    .then(async ({ loadBrowserAccessibilityWasm }) =>
      setAccessibilityCore(await loadBrowserAccessibilityWasm(source, options)),
    ));
}
interface TabInfo {
  id?: number;
  title?: string | null;
  url?: string | null;
  active?: boolean;
}
interface CaptureOptions {
  disableDiffing?: boolean;
}
type CaptureCdp = AXTrackingCdp & AXDocumentCollector["cdp"];
type CaptureResult = {
  snapshotId?: string;
  state?: string;
  data?: unknown;
  screenshot_unavailable?: string;
};
type CaptureCandidate = NonNullable<
  Parameters<AccessibilityTracking["commitCapture"]>[1]["candidate"]
> & { elementCount: number };
type CandidateResult = {
  candidate?: CaptureCandidate;
  data?: unknown;
  documentKey: string;
  screenshotUnavailable?: string;
};
type Screenshot = () => Promise<{ data?: unknown }>;
/** Original Kh, assembled from its restored state, tracking, document and tree logic. */
export class AccessibilityCaptureManager extends AccessibilityTracking {
  declare cdp: CaptureCdp;
  getTab?: (
    tabId: number,
  ) => Promise<TabInfo | undefined> | TabInfo | undefined;
  accessibilityCore: AXCore;
  constructor(
    cdp: CaptureCdp,
    getSessionId: () => string,
    actions: { perform(tabId: number, action: any): Promise<unknown> },
    options: {
      observeNavigations?: boolean;
      performanceSpan?: AXPerformanceSpan;
      getTab?: AccessibilityCaptureManager["getTab"];
      getSiteInstruction?: (tabId: number, url: string) => unknown;
      accessibilityCore?: AXCore;
    } = {},
  ) {
    super(cdp, getSessionId, actions, {
      ...options,
      observeNavigations: false,
    });
    this.getTab = options.getTab;
    this.getSiteInstruction = options.getSiteInstruction;
    this.accessibilityCore =
      options.accessibilityCore ?? defaultAccessibilityCore;
    if (options.observeNavigations !== false) this.startObserving();
  }
  captureSessions(
    state: AXTabState,
    tree: AXFrameTree,
    snapshot: AXDOMSnapshot,
    warnings: string[],
  ) {
    return captureAXSessions(this, state, tree, snapshot, warnings);
  }
  captureDocuments(
    state: AXTabState,
    sessions: AXCaptureSession[],
    warnings: string[],
  ) {
    return captureAXDocuments(this, state, sessions, warnings);
  }
  async captureAX(state: AXTabState, options: CaptureOptions) {
    return await this.performanceSpan.withSpan(
      "browser_use.ax.capture",
      { "tab.id": state.tabId },
      () => this.buildAXCandidate(state, options),
    );
  }
  async buildAXCandidate(
    state: AXTabState,
    options: CaptureOptions,
  ): Promise<CaptureCandidate> {
    const [{ frameTree }, tab, domSnapshot] = await Promise.all([
      this.cdp.call(state.tabId, "Page.getFrameTree"),
      this.getTab?.(state.tabId),
      this.cdp.callTarget(
        { tabId: state.tabId },
        "DOMSnapshot.captureSnapshot",
        {
          computedStyles: [],
          includePaintOrder: false,
          includeDOMRects: false,
        },
      ),
    ]);
    const warnings: string[] = [],
      sessions = await this.captureSessions(
        state,
        frameTree,
        domSnapshot,
        warnings,
      ),
      documents = await this.captureDocuments(state, sessions, warnings),
      merged = mergeAXDocuments(documents, warnings),
      documentKey = accessibilityDocumentKey(
        frameTree.frame.id,
        frameTree.frame.loaderId,
      ),
      targets = new Map<string, AXActionTarget>(),
      byFrame = new Map(
        documents.map((document) => [document.frame.frameId, document]),
      ),
      frames = new Map(
        documents.map((document) => [document.frame.frameId, document.frame]),
      );
    const nodes = [];
    for (const node of merged) {
      const { frameId, ...converted } = node,
        document = byFrame.get(frameId),
        frame = document?.frame;
      if (frame != null) {
        nodes.push(converted);
        if (node.backendDOMNodeID != null)
          targets.set(accessibilityNodeIdentity(state.tabId, converted), {
            actionDescriptions:
              converted.properties.expanded?.value === true
                ? ["Collapse"]
                : converted.properties.expanded?.value === false
                  ? ["Expand"]
                  : [],
            target: frame.target,
            backendNodeId: node.backendDOMNodeID,
            isOptionElement:
              document?.metadata.get(node.backendDOMNodeID)?.tagName ===
              "option",
            frameId: frame.frameId,
            loaderId: frame.loaderId,
          });
      }
    }
    const snapshot = {
      capturedAt: new Date().toISOString(),
      tab: {
        id: state.tabId,
        title: tab?.title ?? null,
        url: tab?.url ?? frameTree.frame.url ?? state.url ?? null,
        active: tab?.active ?? false,
      },
      nodes,
      warnings,
    };
    const revision = this.accessibilityCore.buildRevision(
      state.accessibilityRevision,
      snapshot,
      { mode: options.disableDiffing ? "full" : "auto" },
    );
    return {
      tab: snapshot.tab,
      rendered: revision.text,
      elementCount: nodes.length,
      url: frameTree.frame.url,
      documentKey,
      frames,
      targets,
      accessibilityRevision: revision,
    };
  }
  async captureJavaScriptDialog(
    state: AXTabState,
    dialog: any,
    options: CaptureOptions,
  ): Promise<CaptureCandidate> {
    const tab = await this.getTab?.(state.tabId),
      snapshot = {
        capturedAt: new Date().toISOString(),
        tab: {
          id: state.tabId,
          title: tab?.title ?? null,
          url: tab?.url ?? (dialog.url || state.url) ?? null,
          active: tab?.active ?? false,
        },
        nodes: javaScriptDialogTree(tab, dialog),
        warnings: [],
      };
    const frameId = state.mainFrameId ?? `javascript-dialog:${dialog.id}`,
      frame = {
        frameId,
        loaderId: state.loaderId,
        target: dialog.target as CdpTarget,
      },
      targets = new Map<string, AXActionTarget>();
    for (const node of snapshot.nodes) {
      const target = (
          node as typeof node & {
            dialogTarget?: { control: string; dialogID: string };
          }
        ).dialogTarget as { control: string; dialogID: string } | undefined,
        control = target?.control;
      if (
        target == null ||
        (control !== "accept" && control !== "dismiss" && control !== "prompt")
      )
        continue;
      targets.set(accessibilityNodeIdentity(state.tabId, node), {
        actionDescriptions: [],
        backendNodeId: 0,
        frameId,
        javaScriptDialog: { dialogID: target.dialogID, control },
        loaderId: state.loaderId,
        target: dialog.target,
      });
    }
    const revision = this.accessibilityCore.buildRevision(
      state.accessibilityRevision,
      snapshot,
      { mode: options.disableDiffing ? "full" : "auto" },
    );
    return {
      tab: snapshot.tab,
      rendered: revision.text,
      elementCount: snapshot.nodes.length,
      url: snapshot.tab.url ?? undefined,
      documentKey: accessibilityDocumentKey(state.mainFrameId, state.loaderId),
      frames: new Map([[frameId, frame]]),
      targets,
      accessibilityRevision: revision,
    };
  }
  async captureCandidate(
    state: AXTabState,
    content: string,
    screenshot: Screenshot,
    options: CaptureOptions,
  ): Promise<CandidateResult> {
    const documentKey = accessibilityDocumentKey(
      state.mainFrameId,
      state.loaderId,
    );
    return await raceJavaScriptDialog<CandidateResult>(
      this.cdp,
      state.tabId,
      async () => {
        const [candidate, image] = await Promise.all([
          content === "screenshot" ? undefined : this.captureAX(state, options),
          content === "axState" ? undefined : screenshot(),
        ]);
        return { candidate, data: image?.data, documentKey };
      },
      async (dialog) => {
        const message = `Screenshot unavailable while a JavaScript ${dialog.type} dialog is open. Use tab.ax.get("state") and tab.ax.click(elementIndex) to interact with its controls.`;
        if (content === "screenshot")
          return { documentKey, screenshotUnavailable: message };
        const candidate = await this.captureJavaScriptDialog(
          state,
          dialog,
          options,
        );
        return content === "axState"
          ? { candidate, documentKey }
          : {
              candidate: {
                ...candidate,
                rendered: `${candidate.rendered}\n\n${message}`,
              },
              documentKey,
              screenshotUnavailable: message,
            };
      },
    );
  }
  async capture(
    tabId: number,
    content: string,
    options: CaptureOptions,
    screenshot: Screenshot = async () => {
      throw new Error("Screenshot capture was not provided");
    },
  ): Promise<CaptureResult> {
    if (
      content === "screenshot" &&
      !this.sessions.get(this.getSessionId())?.has(tabId) &&
      this.cdp.getJsDialog(tabId) == null
    )
      return await raceJavaScriptDialog<CaptureResult>(
        this.cdp,
        tabId,
        async () => ({ data: (await screenshot()).data }),
        () => this.capture(tabId, content, options, screenshot),
      );
    const state = await this.ensureTracked(tabId);
    this.throwPendingError(tabId);
    let pending = state.pendingNavigationState;
    if (pending != null && content === "screenshot") {
      let current = this.navigationState(state);
      if (!navigationChanged(pending, current)) {
        await waitAXMilliseconds(250);
        this.throwPendingError(tabId);
        current = this.navigationState(state);
      }
      if (!navigationChanged(pending, current)) {
        const candidate = await this.captureCandidate(
            state,
            content,
            screenshot,
            options,
          ),
          result = this.commitCapture(state, candidate);
        if (result != null) return result;
      }
    }
    if (pending == null) {
      const current = this.navigationState(state);
      if (!current.loading) {
        const candidate = await this.captureCandidate(
            state,
            content,
            screenshot,
            options,
          ),
          result = this.commitCapture(state, candidate);
        if (result != null) return result;
      }
      pending = current;
      state.pendingNavigationState = pending;
    }
    let stable = await this.waitForNavigation(state, pending),
      navigated =
        pending.loading ||
        pending.navigationRevision !== stable.navigationRevision;
    if (navigated) stable = await this.waitForFirstPaint(state, stable);
    stable = await this.waitForAXQuiet(state, stable, navigated);
    let probed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const captured = await this.captureCandidate(
        state,
        content,
        screenshot,
        options,
      );
      this.throwPendingError(tabId);
      const candidate = captured.candidate;
      if (candidate == null && content !== "screenshot")
        throw new Error("Accessibility capture was empty");
      let current = this.navigationState(state);
      if (
        candidate != null &&
        navigated &&
        !probed &&
        candidate.elementCount < 100
      ) {
        current = await this.probeNavigationState(state);
        if (needsCaptureRetry(candidate.elementCount, current)) {
          probed = true;
          await waitAXMilliseconds(100);
          this.throwPendingError(tabId);
          stable = current;
          continue;
        }
      }
      const usable =
        candidate != null
          ? isCaptureUsable(candidate, current)
          : current.revision === stable.revision &&
            (current.painted ||
              current.tabStatus === "complete" ||
              captured.screenshotUnavailable != null);
      if (
        (!current.loading && current.revision === stable.revision) ||
        usable
      ) {
        const result = this.commitCapture(state, captured);
        if (result != null) return result;
        navigated = true;
        stable = await this.waitForFirstPaint(
          state,
          this.navigationState(state),
        );
        stable = await this.waitForAXQuiet(state, stable, true);
        continue;
      }
      stable =
        current.loading ||
        current.navigationRevision !== stable.navigationRevision
          ? await this.waitForFirstPaint(state, current)
          : current;
    }
    const final = await this.captureCandidate(
        state,
        content,
        screenshot,
        options,
      ),
      result = this.commitCapture(state, final);
    if (result == null)
      throw new Error("Accessibility capture changed before it was committed");
    return result;
  }
}
