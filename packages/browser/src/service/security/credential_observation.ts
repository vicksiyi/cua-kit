import { codexTurnMetadata } from "../preferences/request_context";

const messages = {
  credential_delivery_in_progress:
    "Browser observation is unavailable while credential delivery is in progress. Wait for credential delivery to finish, then retry the command.",
  credential_observation_restricted:
    "Browser observation is unavailable for a document containing native credentials. Navigate to a new document to continue. If observation remains blocked, use Tab.requestUserTakeover() to let the user take over.",
  retained_data_restricted:
    "Browser observation is unavailable because retained browser data remains restricted after native credential delivery. Create a new tab and navigate to a new document to continue.",
  credential_state_unavailable:
    "Browser observation is unavailable because native credential state cannot be safely resumed. Start a new browser runtime to continue.",
  protected_command_failed:
    "Browser observation is unavailable because protected document state could not be verified. The underlying error was withheld; this does not establish a credential-policy denial.",
};
type Reason = keyof typeof messages;
export class CredentialObservationError extends Error {
  declare reason: Reason;
  constructor(reason: Reason) {
    super(messages[reason]);
    this.reason = reason;
    this.name = "CredentialObservationError";
  }
}
function restricted(reason: Reason = "credential_observation_restricted") {
  return new CredentialObservationError(reason);
}
function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
export interface CredentialCdp {
  call(tabId: number, method: string, params: any, options?: any): Promise<any>;
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
}
interface CredentialRuntime {
  env: Record<string, string | undefined>;
  requestMeta?: Record<string, any>;
  gaas?: {
    getNativeCredentialObservationStatus?: (
      session: string,
      epoch: unknown,
    ) => Promise<boolean | undefined>;
  };
}
/** Original module state fo/ff/E_/T_/oc/vB/sc/ic. The default instance is shared across browsers. */
export function createCredentialObservationState() {
  const gates = new Map<string, CredentialObservationGate>();
  const observations = new Set<symbol>();
  const drainListeners = new Set<() => void>();
  const resumeListeners = new Set<(resumed: boolean) => void>();
  let initialization: Promise<void> | undefined;
  let readStatus: (() => Promise<boolean | undefined> | undefined) | undefined;
  let unavailable = false;
  let resumeEpoch: unknown;
  function assertAvailable() {
    if (unavailable) throw restricted("credential_state_unavailable");
  }
  async function awaitResumption() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 3500);
      });
      for (;;) {
        const epoch = resumeEpoch;
        const status = await Promise.race([readStatus?.(), timeout]);
        assertAvailable();
        if (status === false) return;
        if (status !== true || epoch == null) throw new Error();
        if (epoch === resumeEpoch) {
          const { promise, resolve } = Promise.withResolvers<boolean>();
          resumeListeners.add(resolve);
          try {
            if ((await Promise.race([promise, timeout])) !== true)
              throw new Error();
          } finally {
            resumeListeners.delete(resolve);
          }
        }
      }
    } catch {
      unavailable = true;
      throw restricted("credential_state_unavailable");
    } finally {
      clearTimeout(timer);
    }
  }
  async function initialize(runtime: CredentialRuntime) {
    if (
      runtime.gaas == null ||
      (runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION !== "1" &&
        !["7", "8", "10"].includes(
          runtime.env.BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION ?? "",
        ))
    )
      return;
    initialization ??= (async () => {
      try {
        if (runtime.env.ENABLE_BROWSER_SESSION_TAB_OWNERSHIP !== "true")
          throw new Error();
        if (
          runtime.env.BROWSER_AUTH_BROKER_SOCKET_PATH !==
          "/run/codex-browser-auth/browser-auth-broker.sock"
        )
          throw new Error();
        const meta = codexTurnMetadata(runtime);
        const session =
          meta?.thread_source === "subagent" &&
          typeof meta.thread_id === "string"
            ? meta.thread_id
            : typeof meta?.session_id === "string"
              ? meta.session_id
              : undefined;
        if (!session || session.length > 256) throw new Error();
        readStatus = () =>
          runtime.gaas?.getNativeCredentialObservationStatus?.(
            session,
            resumeEpoch,
          );
        await awaitResumption();
      } catch {
        unavailable = true;
        throw restricted("credential_state_unavailable");
      }
    })();
    await initialization;
  }
  async function ensureResumed() {
    assertAvailable();
    if (initialization != null) {
      await initialization;
      if (![...gates.values()].some((gate) => gate.usedNativeCredentials))
        await awaitResumption();
    }
  }
  function resume(next: unknown, previous?: unknown) {
    if (initialization == null) return true;
    if (previous === undefined) return false;
    if (previous !== (resumeEpoch ?? null)) {
      unavailable = true;
      throw restricted("credential_state_unavailable");
    }
    resumeEpoch = next;
    for (const listener of resumeListeners) listener(true);
    return true;
  }
  function beginObservation() {
    assertAvailable();
    if ([...gates.values()].some((gate) => gate.protectionPending))
      throw restricted("credential_delivery_in_progress");
    const token = Symbol();
    observations.add(token);
    return () => {
      observations.delete(token);
      if (observations.size === 0)
        for (const listener of [...drainListeners]) listener();
    };
  }
  async function drainObservations() {
    if (observations.size !== 0)
      await new Promise<void>((resolve) => {
        const listener = () => {
          drainListeners.delete(listener);
          resolve();
        };
        drainListeners.add(listener);
      });
  }
  /** Original C_: credential protection and per-document observation epochs. */
  class CredentialObservationGate {
    browserId: string;
    cdp: CredentialCdp;
    revision = 0;
    observationRevision = 0;
    restriction: "ordinary" | "private" | undefined;
    pending = false;
    manualSavingTabs = new Set<number>();
    pendingInteractions = new Map<number, symbol>();
    ordinaryInteractionTabs = new Set<number>();
    privateInteractionOrigins = new Map<number, string>();
    documents = new Map<number, Set<string>>();
    permittedDocuments = new Map<number, string>();
    mainFrameIds = new Map<number, string>();
    constructor(browserId: string, cdp: CredentialCdp) {
      this.browserId = browserId;
      this.cdp = cdp;
    }
    rebind(cdp: CredentialCdp) {
      if (this.cdp !== cdp) {
        this.revision += 1;
        this.invalidateDocuments();
        this.mainFrameIds.clear();
        this.cdp = cdp;
      }
    }
    get epoch() {
      return this.revision;
    }
    get observationEpoch() {
      return this.observationRevision;
    }
    invalidateDocuments(tabId?: number) {
      if (tabId == null) {
        this.permittedDocuments.clear();
        this.pendingInteractions.clear();
        this.ordinaryInteractionTabs.clear();
        this.privateInteractionOrigins.clear();
      } else this.permittedDocuments.delete(tabId);
      this.invalidateObservations(tabId);
    }
    invalidateObservations(tabId?: number) {
      if (
        (tabId == null ||
          (!this.ordinaryInteractionTabs.has(tabId) &&
            !this.privateInteractionOrigins.has(tabId))) &&
        [...gates.values()].some((gate) => gate.usedNativeCredentials)
      )
        this.observationRevision += 1;
    }
    bindNavigationEvents(cdp: CredentialCdp) {
      const event = (event: any) => {
        if (
          cdp !== this.cdp ||
          event.source.sessionId != null ||
          event.source.targetId != null
        )
          return;
        const tabId = event.source.tabId;
        if (
          event.method === "Page.frameNavigated" &&
          event.params.frame.parentId == null
        ) {
          if (!this.isPrivateContinuationDocument(tabId, event.params.frame))
            this.privateInteractionOrigins.delete(tabId);
          this.mainFrameIds.set(tabId, event.params.frame.id);
          this.invalidateDocuments(tabId);
        } else if (
          event.method === "Page.frameStartedNavigating" &&
          this.mainFrameIds.get(tabId) === event.params.frameId
        ) {
          const origin = this.privateInteractionOrigins.get(tabId);
          if (origin != null && parseUrl(event.params.url)?.origin !== origin)
            this.privateInteractionOrigins.delete(tabId);
          if (
            event.params.navigationType === "sameDocument" ||
            event.params.navigationType === "historySameDocument"
          )
            this.invalidateObservations(tabId);
          else this.invalidateDocuments(tabId);
        } else if (
          event.method === "Page.navigatedWithinDocument" &&
          (this.mainFrameIds.get(tabId) == null ||
            this.mainFrameIds.get(tabId) === event.params.frameId)
        )
          this.invalidateObservations(tabId);
      };
      const detached = (tabId: number, reason: string) => {
        if (cdp !== this.cdp) return;
        this.revision += 1;
        this.mainFrameIds.delete(tabId);
        this.pendingInteractions.delete(tabId);
        const ordinary = this.ordinaryInteractionTabs.delete(tabId);
        this.privateInteractionOrigins.delete(tabId);
        this.invalidateDocuments(tabId);
        if (reason === "turnEnded" && ordinary)
          this.ordinaryInteractionTabs.add(tabId);
      };
      cdp.on("event", event);
      cdp.on("tabDetached", detached);
      return () => {
        if (cdp === this.cdp) {
          this.revision += 1;
          this.invalidateDocuments();
          this.mainFrameIds.clear();
        }
        cdp.removeListener("event", event);
        cdp.removeListener("tabDetached", detached);
      };
    }
    get usedNativeCredentials() {
      return this.restriction != null;
    }
    get protectionPending() {
      return this.pending;
    }
    async protectManualSaving(
      tabId: number,
      beforeDrain?: () => void,
      mode: "ordinary" | "private" = "private",
    ) {
      const token = await this.protect(tabId, beforeDrain, mode);
      this.manualSavingTabs.add(tabId);
      return token;
    }
    hasManualSavingTab(tabId: number) {
      return this.manualSavingTabs.has(tabId);
    }
    allowOrdinaryInteraction(tabId: number, token: symbol, release = false) {
      if (
        this.pending ||
        this.pendingInteractions.get(tabId) !== token ||
        !Number.isSafeInteger(tabId) ||
        tabId <= 0 ||
        !this.manualSavingTabs.has(tabId)
      )
        throw restricted();
      this.invalidateDocuments(tabId);
      this.pendingInteractions.delete(tabId);
      this.manualSavingTabs.delete(tabId);
      if (release && this.restriction === "ordinary") {
        this.documents.delete(tabId);
        if (this.documents.size === 0) this.restriction = undefined;
      }
      this.ordinaryInteractionTabs.add(tabId);
    }
    allowPrivateInteraction(tabId: number, origin: string, token: symbol) {
      const url = parseUrl(origin);
      if (
        this.pending ||
        this.pendingInteractions.get(tabId) !== token ||
        url?.protocol !== "https:" ||
        url.origin !== origin
      )
        throw restricted();
      this.invalidateDocuments(tabId);
      this.pendingInteractions.delete(tabId);
      this.manualSavingTabs.delete(tabId);
      this.privateInteractionOrigins.set(tabId, origin);
    }
    async protect(
      tabId: number,
      beforeDrain?: () => void,
      mode: "ordinary" | "private" = "private",
    ) {
      if (this.pending) throw restricted("credential_delivery_in_progress");
      this.pending = true;
      if (this.restriction !== "private") this.restriction = mode;
      this.revision += 1;
      this.invalidateDocuments();
      for (const gate of gates.values())
        if (gate !== this) {
          gate.revision += 1;
          gate.invalidateDocuments();
        }
      const token = Symbol();
      this.pendingInteractions.set(tabId, token);
      try {
        beforeDrain?.();
        await drainObservations();
        const { loaderId } = await this.readFrame(tabId);
        if (
          [...this.documents.values()].reduce(
            (total, loaders) => total + loaders.size,
            0,
          ) >= 64
        )
          throw restricted();
        const loaders = this.documents.get(tabId) ?? new Set<string>();
        loaders.add(loaderId);
        this.documents.set(tabId, loaders);
        return token;
      } catch (error) {
        this.pendingInteractions.delete(tabId);
        throw error instanceof CredentialObservationError
          ? error
          : restricted("protected_command_failed");
      } finally {
        this.pending = false;
      }
    }
    permitNavigatedDocument(tabId: number, loaderId: string, epoch: number) {
      if (
        !this.usedNativeCredentials &&
        ![...gates.values()].some((gate) => gate.usedNativeCredentials)
      )
        return;
      if (
        this.pending ||
        this.revision !== epoch ||
        !Number.isSafeInteger(tabId) ||
        tabId <= 0 ||
        !loaderId ||
        this.documents.get(tabId)?.has(loaderId) === true
      )
        throw restricted();
      this.invalidateDocuments(tabId);
      this.permittedDocuments.set(tabId, loaderId);
    }
    async assertObservationAllowed(
      tabId: number,
      expectedEpoch?: number,
      enforce = this.usedNativeCredentials,
    ) {
      const epoch = this.observationRevision;
      const check = () => {
        if (this.pending) throw restricted("credential_delivery_in_progress");
        if (
          this.observationRevision !== epoch ||
          (expectedEpoch !== undefined &&
            expectedEpoch !== this.observationRevision)
        )
          throw restricted();
      };
      check();
      if (enforce && !this.ordinaryInteractionTabs.has(tabId)) {
        const permitted = this.permittedDocuments.get(tabId),
          privateInteraction = this.privateInteractionOrigins.has(tabId);
        if (permitted == null && !privateInteraction) throw restricted();
        const frame = await this.readFrame(tabId);
        if (
          (privateInteraction
            ? !this.isPrivateContinuationDocument(tabId, frame)
            : frame.loaderId !== permitted) ||
          this.documents.get(tabId)?.has(frame.loaderId) === true
        ) {
          if (
            this.documents.get(tabId)?.has(frame.loaderId) !== true &&
            this.privateInteractionOrigins.delete(tabId)
          )
            this.invalidateDocuments(tabId);
          throw restricted();
        }
      }
      check();
    }
    assertRetainedObservationAllowed() {
      if (this.usedNativeCredentials)
        throw restricted("retained_data_restricted");
    }
    async observe<T>(
      operation: () => Promise<T> | T,
      tabId: number,
    ): Promise<T> {
      const release = beginObservation(),
        epoch = this.observationEpoch;
      try {
        await this.assertObservationAllowed(tabId, epoch);
        let result;
        try {
          result = await operation();
        } catch (error) {
          await this.assertObservationAllowed(tabId, epoch);
          throw error;
        }
        await this.assertObservationAllowed(tabId, epoch);
        return result;
      } finally {
        release();
      }
    }
    isPrivateContinuationDocument(tabId: number, frame: any) {
      const origin = this.privateInteractionOrigins.get(tabId);
      return (
        origin != null &&
        frame.securityOrigin === origin &&
        parseUrl(frame.url)?.origin === origin &&
        !frame.unreachableUrl &&
        this.documents.get(tabId)?.has(frame.loaderId) !== true
      );
    }
    async readFrame(tabId: number, timeoutMs = 2000) {
      if (!Number.isSafeInteger(tabId) || tabId <= 0) throw restricted();
      try {
        const { frameTree } = await this.cdp.call(
          tabId,
          "Page.getFrameTree",
          undefined,
          { timeoutMs },
        );
        const { id, loaderId } = frameTree.frame;
        if (
          typeof id !== "string" ||
          !id ||
          typeof loaderId !== "string" ||
          !loaderId
        )
          throw restricted("protected_command_failed");
        this.mainFrameIds.set(tabId, id);
        return frameTree.frame;
      } catch (error) {
        throw error instanceof CredentialObservationError
          ? error
          : restricted("protected_command_failed");
      }
    }
  }
  function getGate(browserId: string, cdp: CredentialCdp) {
    let gate = gates.get(browserId);
    if (gate == null) {
      gate = new CredentialObservationGate(browserId, cdp);
      gates.set(browserId, gate);
    } else gate.rebind(cdp);
    return gate;
  }
  return {
    getGate,
    allGates: () => [...gates.values()],
    beginObservation,
    initialize,
    ensureResumed,
    resume,
    isUnavailable: () => unavailable,
  };
}
export const credentialObservationState = createCredentialObservationState();
