#if canImport(SystemSoftware)
import SystemSoftware
#endif
import CoreGraphics

// Registration tail 0x1002599f4..0x100259b00 and observer deinit
// 0x100258580..0x100258680. Callback registry construction, raw callback
// decoding and initial window descriptions remain separate dependencies.
final class CGWindowObserverRegistration<CallbackID> {
    private let events: [WindowServerEvent]
    private let callbackID: CallbackID
    private let removeCallback: (CallbackID) -> Void
    private let mainConnection: () -> OpaquePointer?
    private let removeNotification: (OpaquePointer?, WindowServerEvent, CallbackID) -> CGError

    init(windowIDs: [UInt32], events: [WindowServerEvent],
        registerCallback: () -> CallbackID,
        removeCallback: @escaping (CallbackID) -> Void,
        mainConnection: @escaping () -> OpaquePointer?,
        registerNotification: (OpaquePointer?, WindowServerEvent, CallbackID) -> CGError,
        removeNotification: @escaping (OpaquePointer?, WindowServerEvent, CallbackID) -> CGError,
        requestWindows: (OpaquePointer?, [UInt32], UInt32) -> Void) {
        self.events = events
        self.removeCallback = removeCallback
        self.mainConnection = mainConnection
        self.removeNotification = removeNotification
        callbackID = registerCallback()
        let connection = mainConnection()
        for event in events { _ = registerNotification(connection, event, callbackID) }
        // Checked UInt32 conversion and original window array, including zero,
        // duplicates and empty arrays. Failed registrations do not skip this.
        requestWindows(connection, windowIDs, UInt32(windowIDs.count))
    }
    deinit {
        // Callback removal and releasing its resources precede the native
        // unregistration loop; no rollback/throw on CGError is introduced.
        removeCallback(callbackID)
        let connection = mainConnection()
        for event in events { _ = removeNotification(connection, event, callbackID) }
    }
}
