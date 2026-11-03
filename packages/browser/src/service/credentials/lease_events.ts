import { CredentialLeaseResults } from "./lease_results";
import type { FrameEvent } from "../cdp/frame_methods";
export interface SubmissionCandidate {
  networkId: string;
  fetchId: string;
  released: boolean;
}
/** Original wo. */
export function credentialUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url;
  } catch {
    return;
  }
}
/** Original Z_ event correlation; request admission and start are supplied by the remaining lease layers. */
export abstract class CredentialLeaseEvents extends CredentialLeaseResults {
  declare candidate: SubmissionCandidate | undefined;
  allowedRedirects = new Set<string>();
  allowedUrls = new Set<string>();
  networkRequests = new Map<
    string,
    { loaderId: string; url: string; method: string }
  >();
  networkResponses = new Map<string, { loaderId: string; url: string }>();
  frameNavigations = new Map<string, { url: string; reachable: boolean }>();
  onTabDetached = (tabId: number) => {
    if (tabId === this.tabId) {
      this.detached = true;
      this.setOutcome("submission_failed");
      this.close().catch(() => {});
    }
  };
  onEvent = (event: FrameEvent) => {
    if (event.source.tabId !== this.tabId) return;
    if (
      (event.method === "Page.windowOpen" &&
        this.unsafeOrdinaryRequest == null) ||
      event.method === "Page.javascriptDialogOpening"
    ) {
      this.setOutcome("submission_failed");
      return;
    }
    if (event.method === "Target.attachedToTarget") {
      if (this.unsafeOrdinaryRequest != null) return;
      const info = event.params.targetInfo;
      if (
        info.type === "service_worker" ||
        (info.type === "iframe" && event.params.waitingForDebugger)
      ) {
        this.setOutcome(
          info.type === "service_worker"
            ? "submission_failed"
            : "origin_changed",
          info.type === "iframe" ? "paused_iframe" : "other",
        );
        if (event.params.waitingForDebugger) {
          this.pausedTargets.add(info.targetId);
          this.stopPausedTarget(info.targetId).catch(() => {});
        }
        return;
      }
      if (
        info.type === "iframe" &&
        credentialUrl(info.url)?.origin !== this.target.origin
      )
        this.setOutcome("origin_changed", "iframe_origin");
      return;
    }
    if (event.method === "Target.targetDestroyed") {
      this.pausedTargets.delete(event.params.targetId);
      return;
    }
    if (
      this.unsafeOrdinaryRequest == null &&
      event.method === "Page.frameNavigated" &&
      event.params.frame.id !== this.frameId
    ) {
      const frame = event.params.frame;
      if (
        !(frame.url === "about:blank" || frame.url === "about:srcdoc") &&
        credentialUrl(frame.securityOrigin)?.origin !== this.target.origin
      )
        this.setOutcome("origin_changed", "child_frame_origin");
      return;
    }
    if (event.source.sessionId != null || event.source.targetId != null) return;
    if (event.method === "Network.requestWillBeSent") {
      const { requestId, loaderId, frameId, type, request, redirectResponse } =
        event.params;
      if (
        frameId !== this.frameId ||
        type !== "Document" ||
        redirectResponse != null ||
        this.networkRequests.size >= 32
      )
        return;
      const url = credentialUrl(request.url);
      if (url != null)
        this.networkRequests.set(requestId, {
          loaderId,
          url: url.href,
          method: request.method,
        });
    } else if (event.method === "Network.responseReceived") {
      const { requestId, loaderId, frameId, type, response } = event.params,
        url = credentialUrl(response.url);
      if (
        frameId !== this.frameId ||
        type !== "Document" ||
        url == null ||
        response.status < 200 ||
        response.status > 599 ||
        [204, 205, 301, 302, 303, 307, 308].includes(response.status) ||
        this.networkResponses.size >= 32
      )
        return;
      this.networkResponses.set(requestId, { loaderId, url: url.href });
    } else if (event.method === "Network.loadingFailed") {
      if (event.params.requestId === this.candidate?.networkId) {
        if (this.unsafeOrdinaryRequest == null)
          this.setOutcome("submission_failed");
        else {
          this.ordinarySiteSubmissionSettled = true;
          this.completeOrdinarySiteSubmission(false);
        }
      }
      return;
    } else if (event.method === "Page.frameNavigated") {
      const { frame } = event.params;
      if (frame.id !== this.frameId) return;
      const url = credentialUrl(frame.url);
      if (url == null || this.frameNavigations.size >= 32) return;
      if (this.unsafeOrdinaryRequest != null && !this.ordinarySubmissionSettled)
        this.recordAttempt({
          kind: "site_navigation",
          origin_relation: url.origin === this.target.origin ? "same" : "cross",
        });
      this.frameNavigations.set(frame.loaderId, {
        url: url.href,
        reachable: frame.unreachableUrl == null,
      });
    } else return;
    this.finishCandidate();
  };
  onRequestResolution = (
    tabId: number,
    request: { requestId: string },
    resolution: string,
  ) => {
    if (tabId !== this.tabId || !this.allowedRedirects.has(request.requestId))
      return;
    if (resolution === "blocked") {
      if (this.unsafeOrdinaryRequest == null)
        this.setOutcome("submission_failed");
      else {
        this.ordinarySiteSubmissionSettled = true;
        this.completeOrdinarySiteSubmission(false);
      }
      return;
    }
    if (request.requestId === this.candidate?.fetchId)
      this.candidate.released = true;
    this.finishCandidate();
  };
  finishCandidate() {
    const candidate = this.candidate;
    if (
      candidate == null ||
      !candidate.released ||
      (this.unsafeOrdinaryRequest == null
        ? this.outcome != null
        : this.currentRejection() != null)
    )
      return;
    const request = this.networkRequests.get(candidate.networkId),
      response = this.networkResponses.get(candidate.networkId);
    if (
      request == null ||
      response == null ||
      request.loaderId !== response.loaderId ||
      request.method !== "POST" ||
      (this.unsafeOrdinaryRequest == null && request.url !== this.target.url) ||
      !this.allowedUrls.has(response.url)
    )
      return;
    const frame = this.frameNavigations.get(request.loaderId);
    if (frame != null) {
      if (!frame.reachable || frame.url !== response.url) {
        if (this.unsafeOrdinaryRequest == null)
          this.setOutcome("submission_failed");
        else {
          this.ordinarySiteSubmissionSettled = true;
          this.completeOrdinarySiteSubmission(false);
        }
        return;
      }
      if (this.unsafeOrdinaryRequest != null) {
        if (!this.ordinarySiteSubmissionSettled) {
          this.ordinarySiteSubmissionVerified = true;
          this.ordinarySiteSubmissionSettled = true;
          this.recordAttempt({ kind: "site_submission_verified" });
          this.completeOrdinarySiteSubmission(true);
        }
        return;
      }
      this.setOutcome("submitted");
      this.close().catch(() => {});
    }
  }
}
