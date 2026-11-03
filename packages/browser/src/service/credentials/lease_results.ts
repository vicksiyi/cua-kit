import { CredentialLeaseCleanup } from "./lease_cleanup";
import type { CredentialRequest } from "./request_matching";
export interface LeaseRejection {
  outcome: string;
  reason: unknown;
  request_class: string;
  submission_phase: "not_applicable" | "settled" | "pending";
}
/** Original Z_ result, ordinary-attempt and diagnostic state layered over its cleanup methods. */
export abstract class CredentialLeaseResults extends CredentialLeaseCleanup {
  abstract unsafeOrdinaryRequest:
    ((request: CredentialRequest) => Promise<boolean>) | undefined;
  abstract target: { origin: string; url: string };
  candidate?: unknown;
  outcome?: string;
  requestId = crypto.randomUUID();
  firstRejection?: LeaseRejection;
  ordinaryTerminalRejection?: LeaseRejection;
  ordinarySubmissionSettled = false;
  attemptEvents: Record<string, unknown>[] = [];
  attemptSequence = 0;
  droppedAttemptEvents = 0;
  ordinaryPhase = "prompt";
  ordinaryFinalFill = false;
  ordinarySubmissionUrl?: string;
  ordinarySiteSubmissionVerified = false;
  ordinarySiteSubmissionSettled = false;
  completeOrdinarySiteSubmission: (value: boolean) => void = () => {};
  ordinarySiteSubmission = new Promise<boolean>((resolve) => {
    this.completeOrdinarySiteSubmission = resolve;
  });
  complete: (value: string) => void = () => {};
  completion = new Promise<string>((resolve) => {
    this.complete = resolve;
  });
  completeRejection: (value: string) => void = () => {};
  rejection = new Promise<string>((resolve) => {
    this.completeRejection = resolve;
  });
  async result(timeoutMs: number) {
    if (this.outcome != null) return this.outcome;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<string>((resolve) => {
      timer = setTimeout(
        () => resolve("submission_failed"),
        Math.min(timeoutMs, 5000),
      );
    });
    try {
      return await Promise.race([this.completion, expired]);
    } finally {
      clearTimeout(timer);
    }
  }
  async ordinaryResult() {
    try {
      await this.cdp.call(this.tabId, "Page.getFrameTree", undefined, {
        preserveDebuggerOnTimeout: true,
      });
    } catch (error) {
      if (this.rejectedDocumentCleanup == null) throw error;
    }
    await this.waitForOrdinaryDocumentCleanup();
    if (this.ordinaryTerminalRejection == null) await this.close();
    return this.ordinaryTerminalRejection?.outcome ?? "submitted";
  }
  async waitForOrdinaryDocumentCleanup() {
    if (this.rejectedDocumentCleanup != null) {
      await this.rejectedDocumentCleanup;
      await this.close();
    }
  }
  settleOrdinarySubmission() {
    this.ordinarySubmissionSettled = true;
  }
  recordAttempt(event: Record<string, unknown>) {
    if (this.unsafeOrdinaryRequest == null) return;
    const recorded = {
      ...event,
      sequence: Math.min(this.attemptSequence++, 65535),
      phase: this.ordinaryPhase,
    };
    if (this.attemptEvents.length < 63) this.attemptEvents.push(recorded);
    else if (
      event.kind === "attempt_completed" &&
      this.attemptEvents.length < 64
    )
      this.attemptEvents.push(recorded);
    else
      this.droppedAttemptEvents = Math.min(
        this.droppedAttemptEvents + 1,
        65535,
      );
  }
  beginOrdinaryFill(index: number, final: boolean, url: string) {
    this.ordinaryPhase = "filling";
    this.ordinaryFinalFill = final;
    this.ordinarySubmissionUrl = url;
    this.recordAttempt({
      kind: "field_fill_started",
      field_index: Math.min(index, 63),
    });
  }
  completeOrdinaryFill(index: number) {
    this.recordAttempt({
      kind: "field_fill_completed",
      field_index: Math.min(index, 63),
    });
    if (this.ordinaryFinalFill) this.ordinaryPhase = "before_submit";
  }
  beginOrdinarySubmit() {
    this.ordinaryPhase = "submitting";
    this.recordAttempt({ kind: "submit_started" });
  }
  completeOrdinaryAttempt(outcome: string) {
    this.recordAttempt({ kind: "attempt_completed", outcome });
    this.ordinaryPhase = "settled";
  }
  refreshOrdinaryDocument(frameId: string, origin: string) {
    if (this.unsafeOrdinaryRequest != null) {
      this.frameId = frameId;
      this.target.origin = origin;
    }
  }
  async verifiedOrdinarySiteSubmission(timeoutMs: number) {
    if (this.unsafeOrdinaryRequest == null) return false;
    try {
      await this.cdp.call(this.tabId, "Page.getFrameTree", undefined, {
        preserveDebuggerOnTimeout: true,
      });
    } catch {
      return this.ordinarySiteSubmissionVerified;
    }
    if (this.ordinarySiteSubmissionSettled)
      return this.ordinarySiteSubmissionVerified;
    if (this.candidate == null) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.ordinarySiteSubmission,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), Math.min(timeoutMs, 5000));
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  currentRejection() {
    return this.unsafeOrdinaryRequest != null
      ? (this.ordinaryTerminalRejection?.outcome ?? null)
      : this.outcome === "origin_changed" ||
          this.outcome === "submission_failed"
        ? this.outcome
        : null;
  }
  diagnostics() {
    return {
      schema_version: 1,
      request_id: this.requestId,
      submission_mode:
        this.unsafeOrdinaryRequest == null ? "private" : "ordinary",
      first_rejection: this.firstRejection,
      terminal_rejection:
        this.unsafeOrdinaryRequest == null
          ? this.firstRejection
          : this.ordinaryTerminalRejection,
      attempt_events:
        this.unsafeOrdinaryRequest == null
          ? undefined
          : [...this.attemptEvents],
      dropped_attempt_events:
        this.unsafeOrdinaryRequest == null
          ? undefined
          : this.droppedAttemptEvents,
    };
  }
  whenRejected() {
    return this.rejection;
  }
  setOutcome(outcome: string, reason?: unknown, requestClass = "other") {
    if (outcome !== "submitted") {
      const rejected: LeaseRejection = {
        outcome,
        reason: reason ?? "other",
        request_class: requestClass,
        submission_phase:
          this.unsafeOrdinaryRequest == null
            ? "not_applicable"
            : this.ordinarySubmissionSettled
              ? "settled"
              : "pending",
      };
      this.firstRejection ??= rejected;
      if (this.unsafeOrdinaryRequest != null && requestClass !== "background")
        this.ordinaryTerminalRejection ??= rejected;
    }
    if (this.outcome == null) {
      this.outcome = outcome;
      this.complete(outcome);
      if (outcome !== "submitted") this.completeRejection(outcome);
    }
  }
}
