export interface CdpSourceEvent {
  source: { tabId?: number; sessionId?: string; targetId?: string };
  method: string;
  params?: Record<string, any> | null;
  [key: string]: unknown;
}
export interface CdpEventSource {
  addListener(
    event: "event",
    listener: (value: CdpSourceEvent) => void,
  ): unknown;
  removeListener(
    event: "event",
    listener: (value: CdpSourceEvent) => void,
  ): unknown;
}
export interface WaitForCdpEventOptions {
  signal?: AbortSignal;
  timeoutMessage: string;
  timeoutMs: number;
  initialCheck?: () => Promise<unknown>;
  action?: () => unknown | Promise<unknown>;
}
/** Original qh.waitForEvent. Method body extracted with an explicit owner; not a replacement CDP manager. */
async function waitForEvent(
  this: CdpEventSource,
  tabId: unknown,
  predicate: (event: CdpSourceEvent) => unknown,
  options: WaitForCdpEventOptions,
): Promise<CdpSourceEvent | undefined> {
  const id = Number(tabId);
  if (!Number.isFinite(id))
    throw new Error("waitForEvent requires numeric tab_id");
  if (options.signal?.aborted) throw new Error("waitForEvent aborted");
  const result = Promise.withResolvers<CdpSourceEvent | undefined>();
  let settled = false;
  const resolve = (event?: CdpSourceEvent) => {
    if (!settled) {
      settled = true;
      result.resolve(event);
    }
  };
  const reject = (error: unknown) => {
    if (!settled) {
      settled = true;
      result.reject(error);
    }
  };
  const abort = () => reject(new Error("waitForEvent aborted"));
  const listener = (event: CdpSourceEvent) => {
    if (!(settled || event.source.tabId !== id))
      try {
        if (predicate(event)) resolve(event);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error(`waitForEvent predicate failed: ${String(error)}`),
        );
      }
  };
  const timer = setTimeout(() => {
    reject(new Error(options.timeoutMessage));
  }, options.timeoutMs);
  result.promise.catch(() => {});
  try {
    options.signal?.addEventListener("abort", abort, { once: true });
    this.addListener("event", listener);
    if (options.initialCheck != null)
      options.initialCheck().then((value) => {
        if (value) resolve();
      }, reject);
    if (!options.signal?.aborted) await options.action?.();
    return await result.promise;
  } finally {
    this.removeListener("event", listener);
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export { waitForEvent as waitForCdpEvent };
