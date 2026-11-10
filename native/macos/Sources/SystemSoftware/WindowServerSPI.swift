import CoreGraphics
import Carbon
import SoftLink
import Foundation

// Source wrappers: mainConnectionID 0x10026bb1c, disableUpdate 0x10026cb84,
// reenableUpdate 0x10026cba0. Each has its own lazy initialization token.
public enum WindowServerSPI {
    private typealias MainConnection = @convention(c) () -> OpaquePointer?
    private typealias KeyFocus = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, UnsafeMutablePointer<DarwinBoolean>) -> Int32
    private typealias ReleaseKeyFocus = @convention(c) (UInt32) -> Int32
    private typealias SetWindowLevel = @convention(c) (OpaquePointer?, UInt32, Int32) -> CGError
    private typealias WindowRect = @convention(c) (OpaquePointer?, UInt32, UnsafeMutablePointer<CGRect>) -> CGError
    private typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
    private typealias ModifyNotifications = @convention(c) (OpaquePointer?, Int32, Int32, UnsafeRawPointer?) -> Int32
    private typealias ConnectionProperty = @convention(c) (OpaquePointer?, OpaquePointer?, NSString, NSNumber) -> CGError
    private typealias Update = @convention(c) (OpaquePointer?) -> CGError
    private typealias ConnectionNotify = @convention(c)
        (OpaquePointer?, WindowServerNotificationCallback, UInt32, UnsafeMutableRawPointer?) -> CGError
    private typealias RequestWindowNotifications = @convention(c)
        (OpaquePointer?, UnsafePointer<UInt32>, UInt32) -> Void
    private typealias CaptureImages = @convention(c)
        (OpaquePointer?, UnsafePointer<UInt32>, Int32, UInt32, CGRect) -> Unmanaged<CFArray>?


    private static func resolve(_ request: WindowServerSPISymbolRequest) -> [UnsafeRawPointer?] {
        lookUpBatchSymbolPointers(images: request.images,
            symbolRequests: request.symbols, salt: request.salt).map(\.pointer)
    }
    private static func required(_ pointer: UnsafeRawPointer?) -> UnsafeRawPointer {
        // The pinned native binding also traps for an unresolved required SPI.
        guard let pointer else { preconditionFailure("Required WindowServer SPI is unavailable") }
        return pointer
    }
    private static let functions = resolve(.functions)
    // Read-only diagnostic: resolve pointers without invoking WindowServer SPI.
    public static var observerBindingStatus: [String: Bool] {
        let slots = [("mainConnection", 0), ("registerNotify", 1), ("removeNotify", 2), ("requestWindows", 3)]
        return Dictionary(uniqueKeysWithValues: slots.map { name, index in
            (name, functions.indices.contains(index) && functions[index] != nil)
        })
    }
    private static let mainConnection = unsafeBitCast(required(functions[0]), to: MainConnection.self)
    private static let disable = unsafeBitCast(required(resolve(.disableUpdate).first ?? nil), to: Update.self)
    private static let reenable = unsafeBitCast(required(resolve(.reenableUpdate).first ?? nil), to: Update.self)
    // Single-symbol helper26da14 wraps the same SoftLink batch API with one
    // request. Unlike required observer bindings, capture binding may be nil.
    private static let captureImages: CaptureImages? = {
        guard let pointer = resolve(.captureWindowImagesInRect).first ?? nil else { return nil }
        return unsafeBitCast(pointer, to: CaptureImages.self)
    }()

    public static func captureWindowImagesInRect(_ windows: [UInt32], options: WindowServerCaptureOptions,
        rect: CGRect, connection: OpaquePointer?
    ) -> [CGImage]? {
        let binding = captureImages
        return captureWindowImagesInRect(windows, options: options, rect: rect, connection: connection,
            capture: binding.map { function in { connection, pointer, count, options, rect in
                guard let result = function(connection, pointer, count, options, rect) else { return nil }
                // Original retains an autoreleased array before conditional
                // bridging; the Swift array retains its image objects.
                return windowCaptureImages(result.takeUnretainedValue())
            } })
    }

    // Native26cf58 argument/count gate, injectable without invoking actual SPI.
    public static func captureWindowImagesInRect(_ windows: [UInt32], options: WindowServerCaptureOptions,
        rect: CGRect, connection: OpaquePointer?,
        capture: ((OpaquePointer?, UnsafePointer<UInt32>, Int32, UInt32, CGRect) -> [CGImage]?)?
    ) -> [CGImage]? {
        guard let capture, !windows.isEmpty else { return nil }
        let count = Int32(windows.count)
        return windows.withUnsafeBufferPointer {
            capture(connection, $0.baseAddress!, count, options.rawValue, rect)
        }
    }

    private static let keyFocus = unsafeBitCast(required(functions[7]), to: KeyFocus.self)
    public static func getKeyFocusProcess(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
                                   flag: UnsafeMutablePointer<DarwinBoolean>) -> Int32 {
        keyFocus(process, flag)
    }
    // 0x10026d860 tails through global 0x10155b550: primary slot 8.
    private static let releaseFocus = unsafeBitCast(required(functions[8]), to: ReleaseKeyFocus.self)
    public static func releaseKeyFocus(withID id: UInt32) -> Int32 { releaseFocus(id) }
    // Source wrappers 0x10026bb5c / 0x10026bc50 / 0x10026bbe0.
    // Primary binding slots 1, 2, 3, shared with mainConnection's slot 0.
    private static let registerNotify = unsafeBitCast(required(functions[1]), to: ConnectionNotify.self)
    private static let removeNotify = unsafeBitCast(required(functions[2]), to: ConnectionNotify.self)
    private static let requestWindowNotifications = unsafeBitCast(required(functions[3]), to: RequestWindowNotifications.self)
    public static func registerConnectionNotifyProc(_ connection: OpaquePointer?,
        callback: WindowServerNotificationCallback, event: WindowServerEvent,
        context: UnsafeMutableRawPointer?) -> CGError {
        registerNotify(connection, callback, event.rawValue, context)
    }
    public static func removeConnectionNotifyProc(_ connection: OpaquePointer?,
        callback: WindowServerNotificationCallback, event: WindowServerEvent,
        context: UnsafeMutableRawPointer?) -> CGError {
        removeNotify(connection, callback, event.rawValue, context)
    }
    public static func requestNotificationsForWindows(_ connection: OpaquePointer?,
        windows: UnsafePointer<UInt32>, count: UInt32) {
        requestWindowNotifications(connection, windows, count)
    }
    // 0x10026ccf8: primary binding slot 12, C order connection/window/level.
    private static let windowLevel = unsafeBitCast(required(functions[12]), to: SetWindowLevel.self)
    public static func setWindowLevel(_ level: Int32, forWindow id: UInt32,
                               connection: OpaquePointer?) -> CGError {
        windowLevel(connection, id, level)
    }
    // Original global table begins at 0x10155b510; slots 4/5/6/11.
    // 0x10026cc20 swaps Swift window/connection arguments before C tail-call.
    private static let windowBounds = unsafeBitCast(required(functions[4]), to: WindowRect.self)
    private static let screenRect = unsafeBitCast(required(functions[5]), to: WindowRect.self)
    private static let windowLocation = unsafeBitCast(required(functions[6]), to: SetWindowLocation.self)
    private static let modifyNotifications = unsafeBitCast(required(functions[11]), to: ModifyNotifications.self)
    public static func getWindowBounds(forWindow id: UInt32, connection: OpaquePointer?,
        rect: UnsafeMutablePointer<CGRect>) -> CGError {
        windowBounds(connection, id, rect)
    }
    public static func getScreenRect(forWindow id: UInt32, connection: OpaquePointer?,
        rect: UnsafeMutablePointer<CGRect>) -> CGError {
        screenRect(connection, id, rect)
    }
    public static func setWindowLocation(_ event: CGEvent, location: CGPoint) {
        windowLocation(event, location)
    }
    // 0x10026cef8: C args connection, signed notification value, zero, null.
    public static func modifyConnectionNotifications(_ value: Int32, connection: OpaquePointer?) -> Int32 {
        modifyNotifications(connection, value, 0, nil)
    }
    // 0x10026cd64..0x10026cef8: primary slot10; both connection args
    // are mainConnectionID. Original bridges Int(enabled & 1), not Swift Bool.
    private static let connectionProperty = unsafeBitCast(required(functions[10]), to: ConnectionProperty.self)
    public static func setCursorUpdatesFromBackground(_ enabled: Bool) -> CGError {
        let connection = mainConnectionID()
        let value = NSNumber(value: enabled ? 1 : 0)
        return connectionProperty(connection, connection, "SetsCursorInBackground" as NSString, value)
    }
    public static func mainConnectionID() -> OpaquePointer? { mainConnection() }
    public static func disableUpdate(_ connection: OpaquePointer?) -> CGError { disable(connection) }
    public static func reenableUpdate(_ connection: OpaquePointer?) -> CGError { reenable(connection) }
}
