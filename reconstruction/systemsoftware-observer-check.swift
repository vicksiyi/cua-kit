import Foundation
import CoreGraphics
import ObjectiveC
import SystemSoftware

@main struct Check {
    static func main() {
        precondition(class_getInstanceSize(CGWindow.Observer.self) == 32)
        let registry = CGWindowCallbackRegistry<String>()
        let first = registry.register("first")
        precondition(first == 1 && registry.entry(first) == "first")
        precondition(registry.remove(first) == "first")
        precondition(registry.register("second") == 2)
        var snapshotReads: [UInt32] = []
        let snapshots = snapshotCGWindowDescriptions(windowIDs: [7, 9, 7], lookup: { id -> String? in
            snapshotReads.append(id)
            return id == 9 ? "nine" : snapshotReads.count == 1 ? "old" : nil
        })
        precondition(snapshotReads == [7, 9, 7] && snapshots == [9: "nine"])
        var revision = 0
        let latest = snapshotCGWindowDescriptions(windowIDs: [7, 7], lookup: { _ in revision += 1; return revision })
        precondition(latest == [7: 2])
        let event = WindowServerEvent.allCases.first!
        // Executed value construction must not initialize a native observer.
        var stream = CGWindow.EventStream(windowIDs: [7, 7], events: [event], bufferingPolicy: .bufferingNewest(1))
        precondition(stream.windowIDs == [7, 7] && stream.events == [event])
        if case .bufferingNewest(let capacity) = stream.bufferingPolicy { precondition(capacity == 1) }
        else { preconditionFailure("Wrong initial buffering policy") }
        stream.windowIDs = [9]; stream.events = []; stream.bufferingPolicy = .bufferingOldest(2)
        precondition(stream.windowIDs == [9] && stream.events.isEmpty)
        if case .bufferingOldest(let capacity) = stream.bufferingPolicy { precondition(capacity == 2) }
        else { preconditionFailure("Wrong mutable buffering policy") }
        var order: [String] = []
        var token: CGWindowObserverRegistration<UInt>? = CGWindowObserverRegistration(
            windowIDs: [7, 7, 0], events: [event, event], registerCallback: { order.append("registry"); return 1 },
            removeCallback: { id in precondition(id == 1); order.append("remove-registry") },
            mainConnection: { order.append("connection"); return nil },
            registerNotification: { connection, observed, id in
                precondition(connection == nil && observed == event && id == 1)
                order.append("register"); return .failure
            }, removeNotification: { _, _, _ in order.append("remove-native"); return .failure },
            requestWindows: { _, ids, count in
                precondition(ids == [7, 7, 0] && count == 3); order.append("request")
            })
        precondition(token != nil && order == ["registry", "connection", "register", "register", "request"])
        token = nil
        precondition(order == ["registry", "connection", "register", "register", "request", "remove-registry", "connection", "remove-native", "remove-native"])
        let callbacks = CGWindowCallbackRegistry<CGWindowNotificationEntry<Int>>()
        var delivered: [Int] = []
        let callbackID = callbacks.register(CGWindowNotificationEntry(handler: { window, received in
            precondition(received == event)
            callbacks.withState { precondition($0.entries.count == 1) } // unlocked handler
            delivered.append(window)
        }, initialWindows: [7: 42]))
        var id: UInt32 = 7
        withUnsafeMutablePointer(to: &id) { pointer in
            dispatchCGWindowNotification(rawEvent: event.rawValue, data: UnsafeMutableRawPointer(pointer),
                context: UnsafeMutableRawPointer(bitPattern: callbackID), entry: callbacks.entry,
                window: { _ in 99 })
            dispatchCGWindowNotification(rawEvent: event.rawValue, data: UnsafeMutableRawPointer(pointer),
                context: UnsafeMutableRawPointer(bitPattern: callbackID), entry: callbacks.entry,
                window: { _ in nil })
        }
        precondition(delivered == [99, 42])
        print("SystemSoftware observer registry/registration/dispatch checks passed; no private SPI")
    }
}

// Compile-only original nominal APIs. Never called by fixture main.
func checkOriginalObserverAPIs(_ window: CGWindow) {
    let _: CGWindow.Observer = window.observe(events: []) { _, _ in }
    let _: CGWindow.Observer = CGWindow.Observer(windowIDs: [], events: [], eventHandler: { _, _ in })
}

// Compile-only iterator API: real iterator initialization would register SPI.
func checkOriginalEventStreamAPIs(_ stream: CGWindow.EventStream) async {
    var iterator: CGWindow.EventStream.AsyncIterator = stream.makeAsyncIterator()
    let _: (CGWindow, WindowServerEvent)? = await iterator.next()
    let _: CGWindow.EventStream.AsyncIterator = .init(windowIDs: [], events: [], bufferingPolicy: .unbounded)
}
