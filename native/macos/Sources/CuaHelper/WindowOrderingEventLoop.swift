#if canImport(SystemSoftware)
import SystemSoftware
#endif
private enum WindowOrderingLoopStep { case next, resubscribe, stop }

// The legacy AsyncIteratorProtocol.next requirement is throwing even for
// Failure==Never. Refine its existing method; no erasure or wrapper storage.
protocol WindowOrderingEventIterator: AsyncIteratorProtocol {
    mutating func next() async -> Element?
}
extension CGWindow.EventStream.AsyncIterator: WindowOrderingEventIterator {}
extension CGWindowEventStream.AsyncIterator: WindowOrderingEventIterator {}

// 0x100789184..0x10078abf8. Owner lookup is weak, both before subscribing
// and for each event. Do not hold the owner across the idle iterator.next().
func runWindowOrderingEventLoop<Owner: AnyObject, Window, Iterator: WindowOrderingEventIterator>(
    weakOwner: () -> Owner?, observedWindowIDs: (Owner) -> [UInt32],
    makeIterator: ([UInt32]) -> Iterator,
    handle: (Owner, Window, WindowServerEvent) async throws -> Void,
    reportError: (Error) -> Void) async where Iterator.Element == (Window, WindowServerEvent) {
    func process(_ event: (Window, WindowServerEvent), subscribedIDs: [UInt32]) async -> WindowOrderingLoopStep {
        guard let owner = weakOwner() else { return .resubscribe }
        do { try await handle(owner, event.0, event.1) }
        catch is CancellationError { return .stop }
        catch { reportError(error) }
        // Compare membership after handling, not array order or duplicates.
        return Set(subscribedIDs) == Set(observedWindowIDs(owner)) ? .next : .resubscribe
    }
    while !Task.isCancelled {
        guard let ids = weakOwner().map(observedWindowIDs) else { return }
        var iterator: Iterator? = makeIterator(ids)
        var step = WindowOrderingLoopStep.resubscribe
        while let event = await iterator!.next() {
            step = await process(event, subscribedIDs: ids)
            if case .next = step { continue }
            break
        }
        // Dispose the old observer/stream BEFORE looking up IDs for the next
        // subscription, including after normal stream exhaustion.
        iterator = nil
        if case .stop = step { return }
    }
}

// Extracted observer-factory boundary retained for owned fixture callers.
func runWindowOrderingEventLoop<Owner: AnyObject, Window, Observer>(
    weakOwner: () -> Owner?, observedWindowIDs: (Owner) -> [UInt32],
    makeObserver: @escaping ([UInt32], [WindowServerEvent], @escaping @Sendable (Window, WindowServerEvent) -> Void) -> Observer,
    handle: (Owner, Window, WindowServerEvent) async throws -> Void,
    reportError: (Error) -> Void) async {
    await runWindowOrderingEventLoop(weakOwner: weakOwner, observedWindowIDs: observedWindowIDs,
        makeIterator: { orderingWindowEventStream(observedWindowIDs: $0, makeObserver: makeObserver).makeAsyncIterator() },
        handle: handle, reportError: reportError)
}
