import {
  CredentialLeaseRequests,
  type PausedCredentialRequest,
} from "./lease_requests";
import {
  isCredentialDocumentContained,
  type ContainmentCdp,
} from "./containment";
import type { CredentialRequest } from "./request_matching";
export interface CredentialLeaseCdp extends ContainmentCdp {
  on(event: string, listener: (...args: any[]) => void): unknown;
  suppressRawNetworkEvents(tabId: number): () => unknown;
  protectBrowserAuthNewTargets(tabId: number): Promise<() => Promise<unknown>>;
  protectServiceWorkerStarts(tabId: number): Promise<() => Promise<unknown>>;
  protectBrowserAuthServiceWorkerBypass(
    tabId: number,
  ): Promise<() => Promise<unknown>>;
}
export interface CredentialLeaseRequestsOwner {
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
  addRequestInterceptor(
    tabId: number,
    handler: (request: PausedCredentialRequest) => Promise<"block" | undefined>,
    priority: number,
    options: { drainOnRemove: boolean },
  ): Promise<() => Promise<unknown>>;
}
/** Original Z_ constructor and start, assembled with readable lifecycle/result/event/request layers. */
export class CredentialSubmissionLease extends CredentialLeaseRequests {
  unblockRawEvents: () => unknown;
  constructor(
    public cdp: CredentialLeaseCdp,
    public requests: CredentialLeaseRequestsOwner,
    public tabId: number,
    public frameId: string,
    public target: { origin: string; url: string },
    public matchesCredentialRequest:
      ((request: CredentialRequest) => Promise<boolean>) | undefined,
    public unsafeOrdinaryRequest:
      ((request: CredentialRequest) => Promise<boolean>) | undefined,
    public active: Map<number, unknown>,
  ) {
    super();
    this.unblockRawEvents = cdp.suppressRawNetworkEvents(tabId);
  }
  async start() {
    this.cdp.on("event", this.onEvent);
    this.cdp.on("tabDetached", this.onTabDetached);
    this.requests.on("requestResolution", this.onRequestResolution);
    const remove = await this.requests.addRequestInterceptor(
      this.tabId,
      this.onRequest,
      100,
      { drainOnRemove: this.unsafeOrdinaryRequest != null },
    );
    if (this.closePromise != null) {
      await remove();
      throw new Error("Browser credential submission closed during setup");
    }
    this.removeInterceptor = remove;
    if (this.unsafeOrdinaryRequest == null) {
      this.removeNewPageProtection =
        await this.cdp.protectBrowserAuthNewTargets(this.tabId);
      this.removeWorkerProtection = await this.cdp.protectServiceWorkerStarts(
        this.tabId,
      );
    }
    await this.cdp.call(this.tabId, "Network.enable", {});
    this.removeWorkerBypass =
      await this.cdp.protectBrowserAuthServiceWorkerBypass(this.tabId);
    if (
      !(await isCredentialDocumentContained(
        this.cdp,
        this.tabId,
        this.target.origin,
        undefined,
        this.unsafeOrdinaryRequest != null,
      )) ||
      (this.unsafeOrdinaryRequest == null
        ? this.outcome != null
        : this.currentRejection() != null)
    )
      throw new Error(
        "Browser credential submission cannot contain every document",
      );
  }
}
