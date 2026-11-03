import type { CdpTarget } from "./dispatch_helpers";
import type { FrameEvent } from "./frame_methods";
import type { FrameSession } from "./lifecycle_methods";
export interface RawCdpEvent {
  method: string;
  params?: Record<string, unknown>;
  sequence: number;
  source: Partial<CdpTarget>;
  trackedTargetId?: string;
}
export interface RawEventOptions {
  afterSequence?: number;
  timeoutMs?: number;
  methods?: string[];
  limit?: number;
  target?: Partial<CdpTarget>;
}
export interface RawEventResult {
  cursor: number;
  events: RawCdpEvent[];
  hasMore: boolean;
  truncated: boolean;
}
export interface RawEventOwner {
  rawCdpEventsByTabId: Map<number, RawCdpEvent[]>;
  rawCdpEventEvictedThroughSequenceByTabId: Map<number, number>;
  rawCdpEventSequenceByTabId: Map<number, number>;
  frameSessionsBySessionId: Map<string, FrameSession>;
  nextRawCdpEventSequence(tabId: number): number;
  rawCdpEventSequenceForTab(tabId: number): number;
  matchesRawCdpEventTarget(
    event: RawCdpEvent,
    target?: Partial<CdpTarget>,
  ): boolean;
  rawCdpEventsResult(
    tabId: number,
    after: number,
    options: RawEventOptions,
  ): RawEventResult;
  waitForTabAttachment(tabId: number): Promise<unknown>;
  addListener(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
}
/** Original Dte; source/params references are preserved, internal target tracking is omitted. */
export function publicRawEvent(event: RawCdpEvent): RawCdpEvent {
  return {
    method: event.method,
    ...(event.params == null ? {} : { params: event.params }),
    sequence: event.sequence,
    source: event.source,
  };
}
export const rawEventMethods = {
  recordRawCdpEvent(this: RawEventOwner, tabId: number, event: FrameEvent) {
    const targetId =
      event.source.targetId ??
      (event.source.sessionId == null
        ? undefined
        : this.frameSessionsBySessionId.get(event.source.sessionId)?.targetId);
    const entry: RawCdpEvent = {
      method: event.method,
      ...(event.params == null
        ? {}
        : { params: Object.fromEntries(Object.entries(event.params)) }),
      sequence: this.nextRawCdpEventSequence(tabId),
      source: event.source,
      ...(targetId == null ? {} : { trackedTargetId: targetId }),
    };
    const events = this.rawCdpEventsByTabId.get(tabId) ?? [];
    events.push(entry);
    if (events.length > 1000) {
      const evicted = events.splice(0, events.length - 1000).at(-1);
      if (evicted != null)
        this.rawCdpEventEvictedThroughSequenceByTabId.set(
          tabId,
          evicted.sequence,
        );
    }
    this.rawCdpEventsByTabId.set(tabId, events);
  },
  rawCdpEventsResult(
    this: RawEventOwner,
    tabId: number,
    after: number,
    options: RawEventOptions,
  ) {
    const events = this.rawCdpEventsByTabId.get(tabId) ?? [];
    const truncated =
      after < (this.rawCdpEventEvictedThroughSequenceByTabId.get(tabId) ?? 0);
    const matching = events.filter(
      (event) =>
        event.sequence > after &&
        (options.methods == null || options.methods.includes(event.method)) &&
        this.matchesRawCdpEventTarget(event, options.target),
    );
    const limit = options.limit ?? matching.length;
    const result = matching.slice(0, limit).map(publicRawEvent);
    const hasMore = matching.length > result.length,
      last = result.at(-1);
    return {
      cursor:
        hasMore && last != null
          ? last.sequence
          : this.rawCdpEventSequenceForTab(tabId),
      events: result,
      hasMore,
      truncated,
    };
  },
  rawCdpEventSequenceForTab(this: RawEventOwner, tabId: number) {
    return this.rawCdpEventSequenceByTabId.get(tabId) ?? 0;
  },
  nextRawCdpEventSequence(this: RawEventOwner, tabId: number) {
    const sequence = this.rawCdpEventSequenceForTab(tabId) + 1;
    this.rawCdpEventSequenceByTabId.set(tabId, sequence);
    return sequence;
  },
  matchesRawCdpEventTarget(
    this: RawEventOwner,
    event: RawCdpEvent,
    target?: Partial<CdpTarget>,
  ) {
    return target?.sessionId != null
      ? event.source.sessionId === target.sessionId
      : target?.targetId == null
        ? true
        : event.source.targetId === target.targetId ||
          event.trackedTargetId === target.targetId;
  },
  discardRawCdpEventsForTab(this: RawEventOwner, tabId: number) {
    const sequence = this.rawCdpEventSequenceForTab(tabId);
    if (sequence > 0)
      this.rawCdpEventEvictedThroughSequenceByTabId.set(
        tabId,
        Math.max(
          sequence,
          this.rawCdpEventEvictedThroughSequenceByTabId.get(tabId) ?? 0,
        ),
      );
    this.rawCdpEventsByTabId.delete(tabId);
  },
  async readRawCdpEvents(
    this: RawEventOwner,
    input: unknown,
    options: RawEventOptions = {},
  ): Promise<RawEventResult> {
    const tabId = Number(input);
    if (!Number.isFinite(tabId))
      throw new Error("readRawCdpEvents requires numeric tab_id");
    const requested =
      options.afterSequence ??
      (options.timeoutMs == null
        ? undefined
        : this.rawCdpEventSequenceForTab(tabId));
    await this.waitForTabAttachment(tabId);
    const after = requested ?? this.rawCdpEventSequenceForTab(tabId);
    const result = this.rawCdpEventsResult(tabId, after, options);
    if (
      result.events.length > 0 ||
      result.truncated ||
      options.timeoutMs == null ||
      options.timeoutMs <= 0
    )
      return result;
    return await new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        this.removeListener("event", onEvent);
        this.removeListener("tabDetached", onDetach);
        clearTimeout(timer);
      };
      const finish = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(this.rawCdpEventsResult(tabId, after, options));
        }
      };
      const onEvent = () => {
        const current = this.rawCdpEventsResult(tabId, after, options);
        if (current.events.length > 0 || current.truncated) finish();
      };
      const onDetach = (detachedId: number) => {
        if (detachedId === tabId) finish();
      };
      const timer = setTimeout(finish, options.timeoutMs);
      this.addListener("event", onEvent);
      this.addListener("tabDetached", onDetach);
      onEvent();
    });
  },
};
