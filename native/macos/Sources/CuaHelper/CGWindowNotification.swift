#if canImport(SystemSoftware)
import SystemSoftware
#endif
import CoreGraphics

struct CGWindowNotificationEntry<Window> {
    let handler: (Window, WindowServerEvent) -> Void
    let initialWindows: [UInt32: Window]
}

// C trampoline 0x1002589ac discards payload length. Body 0x10025a964
// validates event/data/context, snapshots the registry entry under its lock,
// then resolves a fresh window description and invokes the handler unlocked.
func dispatchCGWindowNotification<Window>(rawEvent: UInt32, data: UnsafeMutableRawPointer?,
    context: UnsafeMutableRawPointer?,
    entry: (UInt) -> CGWindowNotificationEntry<Window>?, window: (UInt32) -> Window?) {
    guard let event = WindowServerEvent(rawValue: rawEvent), let data, let context else { return }
    let id = data.load(as: UInt32.self)
    guard let snapshot = entry(UInt(bitPattern: context)) else { return }
    guard let resolved = window(id) ?? snapshot.initialWindows[id] else { return }
    snapshot.handler(resolved, event)
}

private enum NativeCGWindowCallbacks {
    static let registry = CGWindowCallbackRegistry<CGWindowNotificationEntry<NativeWindowDescription>>()
}
private let nativeCGWindowNotificationCallback: WindowServerNotificationCallback = { event, data, _, context in
    dispatchCGWindowNotification(rawEvent: event, data: data, context: context,
        entry: { NativeCGWindowCallbacks.registry.entry($0) }, window: systemNativeWindowDescription)
}

// Concrete observer preserves initial descriptions for termination/order-out
// events whose fresh WindowServer description has disappeared. Registration
// errors and unregistration ordering are owned by the restored resource class.
final class NativeCGWindowObserver {
    private let registration: CGWindowObserverRegistration<UInt>
    init(windowIDs: [UInt32], events: [WindowServerEvent],
        handler: @escaping (NativeWindowDescription, WindowServerEvent) -> Void) {
        var initial: [UInt32: NativeWindowDescription] = [:]
        for id in windowIDs {
            if let window = systemNativeWindowDescription(id) { initial[id] = window }
        }
        let snapshot = CGWindowNotificationEntry(handler: handler, initialWindows: initial)
        registration = CGWindowObserverRegistration(windowIDs: windowIDs, events: events,
            registerCallback: { NativeCGWindowCallbacks.registry.register(snapshot) },
            removeCallback: { _ = NativeCGWindowCallbacks.registry.remove($0) },
            mainConnection: WindowServerSPI.mainConnectionID,
            registerNotification: { connection, event, id in
                WindowServerSPI.registerConnectionNotifyProc(connection,
                    callback: nativeCGWindowNotificationCallback, event: event,
                    context: UnsafeMutableRawPointer(bitPattern: id))
            }, removeNotification: { connection, event, id in
                WindowServerSPI.removeConnectionNotifyProc(connection,
                    callback: nativeCGWindowNotificationCallback, event: event,
                    context: UnsafeMutableRawPointer(bitPattern: id))
            }, requestWindows: { connection, windows, count in
                windows.withUnsafeBufferPointer {
                    if let base = $0.baseAddress {
                        WindowServerSPI.requestNotificationsForWindows(connection, windows: base, count: count)
                    } else {
                        // Source passes a non-null empty-array storage pointer;
                        // count zero ensures this placeholder is never read.
                        var unused: UInt32 = 0
                        withUnsafePointer(to: &unused) {
                            WindowServerSPI.requestNotificationsForWindows(connection, windows: $0, count: count)
                        }
                    }
                }
            })
    }
}
