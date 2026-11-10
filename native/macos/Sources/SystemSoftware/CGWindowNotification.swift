import CoreGraphics

public struct CGWindowNotificationEntry<Window> {
    public let handler: (Window, WindowServerEvent) -> Void
    public let initialWindows: [UInt32: Window]
    public init(handler: @escaping (Window, WindowServerEvent) -> Void, initialWindows: [UInt32: Window]) {
        self.handler = handler
        self.initialWindows = initialWindows
    }
}

// C trampoline 0x1002589ac discards payload length. Body 0x10025a964
// validates event/data/context, snapshots the registry entry under its lock,
// then resolves a fresh window description and invokes the handler unlocked.
public func dispatchCGWindowNotification<Window>(rawEvent: UInt32, data: UnsafeMutableRawPointer?,
    context: UnsafeMutableRawPointer?,
    entry: (UInt) -> CGWindowNotificationEntry<Window>?, window: (UInt32) -> Window?) {
    guard let event = WindowServerEvent(rawValue: rawEvent), let data, let context else { return }
    let id = data.load(as: UInt32.self)
    guard let snapshot = entry(UInt(bitPattern: context)) else { return }
    guard let resolved = window(id) ?? snapshot.initialWindows[id] else { return }
    snapshot.handler(resolved, event)
}

// Original259710..2599f4 assigns optional lookup results into the map.
// A repeated ID whose later description is nil removes its prior snapshot.
public func snapshotCGWindowDescriptions<Window>(windowIDs: [UInt32],
    lookup: (UInt32) -> Window?) -> [UInt32: Window] {
    var initial: [UInt32: Window] = [:]
    for id in windowIDs { initial[id] = lookup(id) }
    return initial
}

private enum NativeCGWindowCallbacks {
    static let registry = CGWindowCallbackRegistry<CGWindowNotificationEntry<CGWindow>>()
}
private let nativeCGWindowNotificationCallback: WindowServerNotificationCallback = { event, data, _, context in
    dispatchCGWindowNotification(rawEvent: event, data: data, context: context,
        entry: { NativeCGWindowCallbacks.registry.entry($0) }, window: { CGWindow.window(for: $0) })
}

public extension CGWindow {
    final class Observer {
        // Original object32bytes: events at0x10, callbackID at0x18.
        private let events: [WindowServerEvent]
        private let callbackID: UInt

        public init(windowIDs: [UInt32], events: [WindowServerEvent],
            eventHandler: @escaping @Sendable (CGWindow, WindowServerEvent) -> Void) {
            self.events = events
            let initial = snapshotCGWindowDescriptions(windowIDs: windowIDs,
                lookup: { CGWindow.window(for: $0) })
            let snapshot = CGWindowNotificationEntry(handler: eventHandler, initialWindows: initial)
            callbackID = NativeCGWindowCallbacks.registry.register(snapshot)
            let connection = WindowServerSPI.mainConnectionID()
            for event in events {
                _ = WindowServerSPI.registerConnectionNotifyProc(connection,
                    callback: nativeCGWindowNotificationCallback, event: event,
                    context: UnsafeMutableRawPointer(bitPattern: callbackID))
            }
            windowIDs.withUnsafeBufferPointer { buffer in
                if let base = buffer.baseAddress {
                    WindowServerSPI.requestNotificationsForWindows(connection, windows: base, count: UInt32(windowIDs.count))
                } else {
                    var unused: UInt32 = 0
                    withUnsafePointer(to: &unused) {
                        WindowServerSPI.requestNotificationsForWindows(connection, windows: $0, count: 0)
                    }
                }
            }
        }
        deinit {
            _ = NativeCGWindowCallbacks.registry.remove(callbackID)
            let connection = WindowServerSPI.mainConnectionID()
            for event in events {
                _ = WindowServerSPI.removeConnectionNotifyProc(connection,
                    callback: nativeCGWindowNotificationCallback, event: event,
                    context: UnsafeMutableRawPointer(bitPattern: callbackID))
            }
        }
    }
    func observe(events: [WindowServerEvent],
        eventHandler: @escaping @Sendable (CGWindow, WindowServerEvent) -> Void) -> Observer {
        Observer(windowIDs: [id], events: events, eventHandler: eventHandler)
    }
}
