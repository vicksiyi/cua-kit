import type { FrameSession } from "./lifecycle_methods";
import type { JsDialog } from "./dialog_methods";
import type { RawCdpEvent } from "./raw_event_methods";
import type { WorkerBypassState } from "./protection_methods";
import type { InternalScreencast } from "./screencast_methods";
import { attachmentMethods } from "./attachment_methods";
import { lifecycleMethods } from "./lifecycle_methods";
import { frameMethods } from "./frame_methods";
import { frameTargetMethods } from "./frame_target_methods";
import { dialogMethods } from "./dialog_methods";
import { rawEventMethods } from "./raw_event_methods";
import { protectionMethods } from "./protection_methods";
import { documentMethods } from "./document_methods";
import { closeMethods } from "./close_methods";
import { screencastMethods } from "./screencast_methods";
import { CdpEventEmitter } from "./event_emitter";
import { createCdpExecutionMethods } from "./execute_methods";
import { registerCdpEventBridge, enableOopifAutoAttach } from "./event_bridge";
import { waitForCdpEvent } from "./event_wait";
import { waitForPageLoadEvent } from "./page_load";
import type { CdpExecutionOwner } from "./execute_methods";
import type { CdpAttachmentOwner } from "./attachment_methods";
import type { CdpProtectionOwner } from "./protection_methods";
import type { CdpEventBridgeOwner } from "./event_bridge";
import type { DocumentOwner } from "./document_methods";
import type { CdpLifecycleOwner } from "./lifecycle_methods";

export type CdpProvider = CdpExecutionOwner["api"] &
  CdpAttachmentOwner["api"] &
  CdpProtectionOwner["api"] &
  CdpEventBridgeOwner["api"] &
  DocumentOwner["api"] &
  CdpLifecycleOwner["api"] & {
    attachTarget?(tabId: number, targetId: string): Promise<unknown>;
  };
type BoundMethods<T> = { [K in keyof T]: OmitThisParameter<T[K]> };
/** Reconstructed qh. reportError supplies the original lexical Dt dependency.
 * Each returned class has the original four constructor arguments and prototype methods.
 * Provider methods are required dependencies, with no alternative backend fallback.
 */
export function createCdpManagerClass(
  reportError: Parameters<typeof createCdpExecutionMethods>[0],
) {
  const methods = {
    ...attachmentMethods,
    ...lifecycleMethods,
    ...frameMethods,
    ...frameTargetMethods,
    ...dialogMethods,
    ...rawEventMethods,
    ...protectionMethods,
    ...documentMethods,
    ...closeMethods,
    ...screencastMethods,
    ...createCdpExecutionMethods(reportError),
    enableOopifAutoAttach,
    waitForEvent: waitForCdpEvent,
    waitForPageLoadEvent,
  };
  class CdpManager extends CdpEventEmitter {
    api!: CdpProvider;
    platform!: string;
    performanceSpan!: CdpExecutionOwner["performanceSpan"];
    readNetworkPolicy!: CdpAttachmentOwner["readNetworkPolicy"];
    fileChoosersById = new Map<
      string,
      { tabId: number; [key: string]: unknown }
    >();
    attachedTabIds = new Set<number>();
    turnEndDetachTabIds = new Set<number>();
    tabAttachmentPromises = new Map<number, Promise<unknown>>();
    initializingTabIds = new Set<number>();
    tabAttachHandlers: CdpAttachmentOwner["tabAttachHandlers"] = new Set();
    tabCleanupHandlers: CdpAttachmentOwner["tabCleanupHandlers"] = new Set();
    frameSessionsByTabId = new Map<number, Map<string, FrameSession>>();
    frameSessionsBySessionId = new Map<string, FrameSession>();
    initializedFrameSessions = new WeakSet<FrameSession>();
    frameSessionInitializationPromises = new WeakMap<
      FrameSession,
      Promise<void>
    >();
    attachedFrameTargetIdsByTabId = new Map<number, Set<string>>();
    oopifAutoAttachTabIds = new Set<number>();
    workerStartProtectionByTab = new Map<number, number>();
    browserAuthWorkerBypassByTab = new Map<number, WorkerBypassState>();
    configuredWorkerStartProtection = new Set<number>();
    workerStartConfigurationByTab = new Map<number, Promise<void>>();
    rawCdpEventsByTabId = new Map<number, RawCdpEvent[]>();
    rawCdpEventEvictedThroughSequenceByTabId = new Map<number, number>();
    rawCdpEventSequenceByTabId = new Map<number, number>();
    suppressedRawNetworkByTab = new Map<number, number>();
    browserAuthCredentialDiagnosticsTabs = new Set<number>();
    activeInternalScreencastsByTabId = new Map<number, InternalScreencast>();
    screencastQueuesByTabId = new Map<number, Promise<void>>();
    rawScreencastTabIds = new Set<number>();
    retiredInternalScreencastSessionsByTabId = new Map<
      number,
      Map<number, { expiresAt: number }>
    >();
    mainFrameIdsByTabId = new Map<number, string>();
    topLevelSecurityOriginsByTabId = new Map<number, string>();
    jsDialogsByTabId = new Map<number, JsDialog>();
    jsDialogSequence = 0;
    topLevelUrlsByTabId = new Map<number, string>();
    documentTarget: import("./dispatch_helpers").CdpTarget | undefined;
    constructor(
      api: CdpProvider,
      platform: string,
      performanceSpan: CdpExecutionOwner["performanceSpan"],
      readNetworkPolicy: CdpAttachmentOwner["readNetworkPolicy"],
    ) {
      super();
      this.api = api;
      this.platform = platform;
      this.performanceSpan = performanceSpan;
      this.readNetworkPolicy = readNetworkPolicy;
      registerCdpEventBridge(this as unknown as CdpEventBridgeOwner);
    }
  }
  // Match class method descriptors and the original prototype insertion order.
  const order = [
    "call",
    "callTarget",
    "callRawCdp",
    "isTabAttached",
    "suppressRawNetworkEvents",
    "hasBrowserAuthRawEventProtection",
    "protectBrowserAuthCredentialDiagnostics",
    "browserAuthNewTargetCheck",
    "protectBrowserAuthNewTargets",
    "closeBrowserAuthPausedTarget",
    "protectServiceWorkerStarts",
    "protectBrowserAuthServiceWorkerBypass",
    "readCommittedTabUrl",
    "currentTopLevelUrl",
    "readRawCdpEvents",
    "forDocument",
    "executeTargetCdp",
    "enableOopifAutoAttach",
    "targetForFrame",
    "targetIdForFrame",
    "targetForFrameOrAttach",
    "attachDebuggerFrameTarget",
    "evaluateJavascript",
    "readDocumentState",
    "waitForPageLoadEvent",
    "waitForEvent",
    "withInternalScreencast",
    "detachAllTabs",
    "getJsDialog",
    "activeJsDialog",
    "updateJsDialogPrompt",
    "deleteJsDialog",
    "closeTab",
    "detachTab",
    "addTabCleanupHandler",
    "addTabAttachHandler",
    "runTabAttachHandlers",
    "runTabCleanupHandlers",
    "deleteFileChoosersForTab",
    "waitForTabAttachment",
    "ensureAttachedTab",
    "attachTab",
    "enableFocusEmulation",
    "enableOopifAutoAttachForTarget",
    "configureServiceWorkerStarts",
    "recordRawCdpEvent",
    "withScreencastLock",
    "isInternalScreencastEvent",
    "isCurrentInternalScreencastEvent",
    "activeRetiredInternalScreencastSessions",
    "retireInternalScreencast",
    "attachedTabIdForCdpEvent",
    "rawCdpEventsResult",
    "rawCdpEventSequenceForTab",
    "nextRawCdpEventSequence",
    "rawCdpTarget",
    "matchesRawCdpEventTarget",
    "discardRawCdpEventsForTab",
    "forgetAttachedTab",
    "handleTargetEvent",
    "handleAttachedToTarget",
    "handleDetachedFromTarget",
    "handleFrameNavigated",
    "handleFrameDetached",
    "initializeAttachedFrameSession",
    "tryInitializeAttachedFrameSession",
    "runAttachedFrameSessionInitialization",
    "setFrameSessionForFrame",
    "setFrameSessionTargetId",
    "deleteFrameSession",
    "deleteFrameSessionsForTab",
    "rememberAttachedFrameTarget",
    "detachAttachedFrameTargets",
    "handleJavaScriptDialogEvent",
    "rememberJsDialog",
    "allowBeforeUnload",
    "deleteJsDialogForTarget",
    "throwIfJsDialogBlocksMethod",
    "nextJsDialogId",
  ];
  for (const name of order) {
    Object.defineProperty(CdpManager.prototype, name, {
      value: methods[name as keyof typeof methods],
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return CdpManager as unknown as {
    new (
      ...args: ConstructorParameters<typeof CdpManager>
    ): CdpManager & BoundMethods<typeof methods>;
  };
}

export type CdpManager = InstanceType<ReturnType<typeof createCdpManagerClass>>;
