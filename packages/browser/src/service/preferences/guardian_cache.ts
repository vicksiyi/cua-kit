export interface GuardianOrigin {
  threadId: string;
  origin: string;
}
export interface GuardianApproval {
  expiresAt: number;
}
export interface GuardianReview {
  revoked: boolean;
}
interface Entry {
  approval?: GuardianApproval;
  pending?: {
    decision: Promise<{
      result: unknown;
      approval: GuardianApproval | undefined;
    }>;
    review: GuardianReview;
  };
}
/** Original fr/Nn/ya/BB/R_/DB/RX. The assembled singleton shares per-thread/per-origin review promises. */
export function createGuardianOriginCache() {
  const threads = new Map<string, Map<string, Entry>>();
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  function entryFor(origin: GuardianOrigin) {
    let entries = threads.get(origin.threadId);
    if (entries == null) {
      entries = new Map();
      threads.set(origin.threadId, entries);
    }
    let entry = entries.get(origin.origin);
    if (entry == null) {
      entry = {};
      entries.set(origin.origin, entry);
    }
    return entry;
  }
  function removeExpired(
    threadId: string,
    origin: string,
    entry: Entry,
    now: number,
  ) {
    if (entry.approval != null && entry.approval.expiresAt <= now)
      delete entry.approval;
    if (entry.approval != null || entry.pending != null) return;
    const entries = threads.get(threadId);
    if (entries?.get(origin) === entry) {
      entries.delete(origin);
      if (entries.size === 0) threads.delete(threadId);
    }
  }
  function scheduleCleanup() {
    if (cleanupTimer == null) {
      cleanupTimer = setTimeout(() => {
        cleanupTimer = undefined;
        const now = Date.now();
        for (const [threadId, entries] of threads)
          for (const [origin, entry] of entries)
            removeExpired(threadId, origin, entry, now);
        if (threads.size > 0) scheduleCleanup();
      }, 300000);
      if (typeof cleanupTimer !== "number") cleanupTimer.unref();
    }
  }
  const cache = {
    get(origin: GuardianOrigin | null | undefined) {
      if (origin == null) return;
      const approval = threads
        .get(origin.threadId)
        ?.get(origin.origin)?.approval;
      return approval != null && approval.expiresAt > Date.now()
        ? approval
        : undefined;
    },
    record(origin: GuardianOrigin, review?: GuardianReview) {
      if (review?.revoked !== true) {
        entryFor(origin).approval = { expiresAt: Date.now() + 300000 };
        scheduleCleanup();
      }
    },
    revoke(origin: GuardianOrigin) {
      const entry = threads.get(origin.threadId)?.get(origin.origin);
      if (entry != null) {
        delete entry.approval;
        if (entry.pending != null) {
          entry.pending.review.revoked = true;
          delete entry.pending;
        }
        removeExpired(origin.threadId, origin.origin, entry, Date.now());
      }
    },
    start(
      origin: GuardianOrigin,
      observedApproval: GuardianApproval | undefined,
      review: (state: GuardianReview) => unknown | Promise<unknown>,
    ) {
      const current = cache.get(origin);
      if (current != null && current !== observedApproval)
        return { kind: "retry" as const };
      const entry = entryFor(origin);
      if (entry.pending != null)
        return {
          kind: "review" as const,
          shared: true,
          decision: entry.pending.decision,
        };
      const state = { revoked: false };
      const decision = Promise.resolve()
        .then(() => review(state))
        .then((result) => ({ result, approval: entry.approval }))
        .finally(() => {
          if (entry.pending?.decision === decision) {
            delete entry.pending;
            removeExpired(origin.threadId, origin.origin, entry, Date.now());
          }
        });
      entry.pending = { decision, review: state };
      return { kind: "review" as const, shared: false, decision };
    },
    clear() {
      threads.clear();
      clearTimeout(cleanupTimer);
      cleanupTimer = undefined;
    },
  };
  return cache;
}
export const guardianOriginCache = createGuardianOriginCache();
