import Foundation
import SystemSoftware

@main struct Check {
    final class Owner { var ids: [UInt32] = [1, 1] }
    final class Lease {
        let release: () -> Void
        init(_ release: @escaping () -> Void) { self.release = release }
        deinit { release() }
    }
    struct Iterator: WindowOrderingEventIterator {
        typealias Element = (Int, WindowServerEvent)
        var values: [Int]
        var lease: Lease
        mutating func next() async -> Element? {
            guard !values.isEmpty else { return nil }
            return (values.removeFirst(), .didChangeOrder)
        }
    }
    enum Failure: Error { case action }
    static func main() async {
        let native: CGWindow.EventStream = nativeOrderingWindowEventStream(observedWindowIDs: [7, 7])
        precondition(native.windowIDs == [7, 7] && native.events == [.didChangeOrder])
        if case .bufferingNewest(let capacity) = native.bufferingPolicy { precondition(capacity == 1) }
        else { preconditionFailure("Native subscription buffering changed") }
        let owner = Owner()
        var trace: [String] = []
        var subscriptions = 0
        await runWindowOrderingEventLoop(weakOwner: { [weak owner] in owner }, observedWindowIDs: { $0.ids },
            makeIterator: { ids in
                subscriptions += 1
                let number = subscriptions
                precondition(ids == (number == 1 ? [1, 1] : [2]))
                trace.append("make \(number)")
                return Iterator(values: number == 1 ? [10] : [20, 21], lease: Lease { trace.append("drop \(number)") })
            }, handle: { current, value, _ in
                trace.append("handle \(value)")
                if value == 10 { current.ids = [2] }
                else if value == 20 { throw Failure.action }
                else { throw CancellationError() }
            }, reportError: { error in precondition(error is Failure); trace.append("error") })
        precondition(trace == ["make 1", "handle 10", "drop 1", "make 2", "handle 20", "error", "handle 21", "drop 2"])
        subscriptions = 0; owner.ids = [1, 2, 1]
        await runWindowOrderingEventLoop(weakOwner: { [weak owner] in owner }, observedWindowIDs: { $0.ids },
            makeIterator: { _ in
                subscriptions += 1
                return Iterator(values: [1, 2], lease: Lease {})
            }, handle: { current, value, _ in
                if value == 1 { current.ids = [2, 1] }
                else { throw CancellationError() }
            }, reportError: { _ in preconditionFailure("Unexpected error") })
        precondition(subscriptions == 1)
        await runWindowOrderingEventLoop(weakOwner: { () -> Owner? in nil }, observedWindowIDs: { _ in preconditionFailure() },
            makeIterator: { _ -> Iterator in preconditionFailure("Subscribe after owner gone") },
            handle: { (_: Owner, _: Int, _: WindowServerEvent) in preconditionFailure() }, reportError: { _ in preconditionFailure() })
        print("Window ordering iterator routing/lifetime checks passed; no native subscription")
    }
}
