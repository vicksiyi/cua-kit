// Acquisition stage at 0x100752874: first use the ordinary focused getter.
// A recent-activity gate enables at most 12 additional reads, each preceded
// by usleep(15000). Uncached/cache decoding and fallback remain caller-owned.
func acquireViewBridgeFocusResult<Element>(
    initialRead: () -> Element?,
    recentActivityElapsed: () -> Double,
    sleepMicroseconds: (UInt32) -> Void,
    retryRead: () -> Element?
) -> ViewBridgeFocusAcquisition<Element> {
    if let element = initialRead() { return .element(element) }
    // ARM b.pl rejects >=1 and unordered here.
    guard recentActivityElapsed() < 1 else { return .activityTooOld }
    for _ in 0..<12 {
        sleepMicroseconds(15_000)
        if let element = retryRead() { return .element(element) }
    }
    return .retriesExhausted
}


enum ViewBridgeFocusAcquisition<Element> {
    case element(Element)
    case activityTooOld
    case retriesExhausted
}

// Optional projection for callers needing only the acquisition stage. Full
// owner resolution must retain the result reason for the cached-PID fallback.
func acquireViewBridgeFocusedElement<Element>(
    initialRead: () -> Element?, recentActivityElapsed: () -> Double,
    sleepMicroseconds: (UInt32) -> Void, retryRead: () -> Element?
) -> Element? {
    switch acquireViewBridgeFocusResult(initialRead: initialRead,
        recentActivityElapsed: recentActivityElapsed, sleepMicroseconds: sleepMicroseconds,
        retryRead: retryRead) {
    case .element(let element): return element
    case .activityTooOld, .retriesExhausted: return nil
    }
}

// 0x100753008/3010/3034: stale activity bypasses the cached PID; only an
// exhausted retry sequence may use it. A present element goes to AX resolution.
func resolveAcquiredViewBridgeFocusPID<Element>(
    _ acquisition: ViewBridgeFocusAcquisition<Element>,
    cachedPID: () -> Int32?,
    resolveElement: (Element?) -> Int32
) -> Int32 {
    switch acquisition {
    case .element(let element): return resolveElement(element)
    case .activityTooOld: return resolveElement(nil)
    case .retriesExhausted:
        if let cached = cachedPID() { return cached }
        return resolveElement(nil)
    }
}

// Preserve separate native reads: gate on the last-action time before retries,
// then read cached PID only if the retries exhaust. No early cache snapshot.
func resolveViewBridgePrimaryFocusPIDUsingReads<Element>(
    initialRead: () -> Element?, retryRead: () -> Element?,
    resolveElement: (Element?) -> Int32,
    activity: SyntheticFocusActivity = .shared,
    now: () -> Double,
    sleepMicroseconds: (UInt32) -> Void
) -> Int32 {
    let acquired = acquireViewBridgeFocusResult(initialRead: initialRead,
        recentActivityElapsed: { now() - activity.snapshot().time },
        sleepMicroseconds: sleepMicroseconds, retryRead: retryRead)
    return resolveAcquiredViewBridgeFocusPID(acquired,
        cachedPID: { activity.snapshot().pid }, resolveElement: resolveElement)
}
