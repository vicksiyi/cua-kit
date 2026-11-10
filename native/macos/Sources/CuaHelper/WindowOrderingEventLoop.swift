#if canImport(SystemSoftware)
import SystemSoftware
#endif
private enum WindowOrderingLoopStep { case next, resubscribe, stop }

// 0x100789184..0x10078abf8. Owner lookup is weak, both before subscribing
// and for each event. Do not hold the owner across the idle iterator.next().
func runWindowOrderingEventLoop<Owner: AnyObject, Window, Observer>(
    weakOwner: () -> Owner?, observedWindowIDs: (Owner) -> [UInt32],
    makeObserver: @escaping ([UInt32], [WindowServerEvent], @escaping @Sendable (Window, WindowServerEvent) -> Void) -> Observer,
    handle: (Owner, Window, WindowServerEvent) async throws -> Void,
    reportError: (Error) -> Void) async {
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
        var iterator: CGWindowEventStream<Window, Observer>.AsyncIterator? =
            orderingWindowEventStream(observedWindowIDs: ids, makeObserver: makeObserver).makeAsyncIterator()
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
