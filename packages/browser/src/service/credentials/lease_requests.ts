import { CredentialLeaseEvents, credentialUrl } from "./lease_events";
import type { CredentialRequest } from "./request_matching";
export interface PausedCredentialRequest {
  requestId: string;
  networkId?: string;
  frameId?: string;
  resourceType: string;
  redirectedRequestId?: string;
  request: CredentialRequest & { method: string };
}
/** Original Z_.onRequest: ordinary capture and private one-shot form admission. */
export abstract class CredentialLeaseRequests extends CredentialLeaseEvents {
  abstract matchesCredentialRequest:
    ((request: CredentialRequest) => Promise<boolean>) | undefined;
  candidateClaimed = false;
  ordinaryNetworkEvents = 0;
  onRequest = async (
    paused: PausedCredentialRequest,
  ): Promise<"block" | undefined> => {
    const { request } = paused;
    if (this.unsafeOrdinaryRequest != null) {
      if (paused.frameId !== this.frameId) return;
      const url = credentialUrl(request.url);
      if (url == null || url.protocol !== "https:")
        return this.rejectOrdinaryRequest(
          paused,
          "origin_changed",
          url == null ? "request_url_invalid" : "request_scheme",
        ) as "block";
      const rejection = this.currentRejection();
      if (
        rejection != null &&
        (!this.ordinarySubmissionSettled ||
          this.rejectedDocumentCleanup != null)
      )
        return this.rejectOrdinaryRequest(
          paused,
          rejection,
          undefined,
        ) as "block";
      if (await this.unsafeOrdinaryRequest(request))
        return this.rejectOrdinaryRequest(
          paused,
          "submission_failed",
          undefined,
        ) as "block";
      if (!this.ordinarySubmissionSettled && this.ordinaryNetworkEvents++ < 8)
        this.recordAttempt({
          kind: "site_request",
          request_class:
            paused.resourceType === "Document" ? "main_document" : "background",
          method:
            request.method === "GET"
              ? "get"
              : request.method === "POST"
                ? "post"
                : "other",
          origin_relation: url.origin === this.target.origin ? "same" : "cross",
        });
      if (
        paused.resourceType === "Document" &&
        paused.networkId != null &&
        this.candidate == null &&
        request.method === "POST" &&
        url.href === this.ordinarySubmissionUrl &&
        ((this.ordinaryPhase === "filling" && this.ordinaryFinalFill) ||
          this.ordinaryPhase === "before_submit")
      ) {
        this.candidate = {
          fetchId: paused.requestId,
          networkId: paused.networkId,
          released: false,
        };
        this.allowedRedirects.add(paused.requestId);
        this.allowedUrls.add(url.href);
      } else if (
        paused.resourceType === "Document" &&
        paused.redirectedRequestId != null &&
        this.allowedRedirects.has(paused.redirectedRequestId)
      ) {
        this.allowedRedirects.add(paused.requestId);
        this.allowedUrls.add(url.href);
      }
      return;
    }
    const requestClass =
        paused.frameId === this.frameId && paused.resourceType === "Document"
          ? "main_document"
          : "background",
      url = credentialUrl(request.url);
    if (url == null) {
      this.setOutcome("origin_changed", "request_url_invalid", requestClass);
      return "block";
    }
    const safeMethod = request.method === "GET" || request.method === "HEAD";
    if (
      safeMethod &&
      paused.frameId === this.frameId &&
      paused.resourceType === "Document" &&
      paused.redirectedRequestId != null &&
      this.allowedRedirects.has(paused.redirectedRequestId) &&
      url.protocol === "https:" &&
      url.origin === this.target.origin &&
      this.outcome == null
    ) {
      this.allowedRedirects.add(paused.requestId);
      this.allowedUrls.add(url.href);
      return;
    }
    if (url.origin !== this.target.origin || url.protocol !== "https:") {
      this.setOutcome(
        "origin_changed",
        url.protocol !== "https:" ? "request_scheme" : "request_origin",
        requestClass,
      );
      return "block";
    }
    if (paused.frameId !== this.frameId || paused.resourceType !== "Document") {
      if (safeMethod) return;
      this.setOutcome("submission_failed", "other", requestClass);
      return "block";
    }
    if (
      request.method !== "POST" ||
      url.href !== this.target.url ||
      this.candidateClaimed ||
      paused.networkId == null
    ) {
      this.setOutcome("origin_changed", "other", requestClass);
      return "block";
    }
    this.candidateClaimed = true;
    if (
      this.matchesCredentialRequest == null ||
      !(await this.matchesCredentialRequest(request)) ||
      this.outcome != null
    ) {
      this.setOutcome("submission_failed", "other", requestClass);
      return "block";
    }
    this.candidate = {
      fetchId: paused.requestId,
      networkId: paused.networkId,
      released: false,
    };
    this.allowedRedirects.add(paused.requestId);
    this.allowedUrls.add(url.href);
  };
}
