import CoreGraphics
import SoftLink

public enum CGEventAPI {
    private typealias IntegerGetter = @convention(c) (CGEvent, CGEventField) -> Int64
    private typealias IntegerSetter = @convention(c) (CGEvent, CGEventField, Int64) -> Void

    // Original initializer publishes all24 required functions before returning.
    // Publisher0x10026b0f0 traps on a missing optional/pointer; do not silently
    // fall back or defer missing-slot failure until an individual method call.
    private static let functions: [UnsafeRawPointer] = {
        let resolved = lookUpBatchSymbolPointers(images: CGEventAPISymbolRequest.images,
            symbolRequests: CGEventAPISymbolRequest.symbols, salt: CGEventAPISymbolRequest.salt)
        precondition(resolved.count == 24)
        return resolved.map { match in
            guard let pointer = match.pointer else { preconditionFailure("Required CGEvent API binding is unavailable") }
            return pointer
        }
    }()
    private static let integerGetter = unsafeBitCast(functions[4], to: IntegerGetter.self)
    private static let integerSetter = unsafeBitCast(functions[14], to: IntegerSetter.self)

    // Original0x100257e24 /0x1002580d0: unchanged C argument order.
    public static func getIntegerValueField(_ event: CGEvent, field: CGEventField) -> Int64 {
        integerGetter(event, field)
    }
    public static func setIntegerValueField(_ event: CGEvent, field: CGEventField, value: Int64) {
        integerSetter(event, field, value)
    }
    private typealias FlagsGetter = @convention(c) (CGEvent) -> CGEventFlags
    private typealias FlagsSetter = @convention(c) (CGEvent, CGEventFlags) -> Void
    private static let flagsGetter = unsafeBitCast(functions[3], to: FlagsGetter.self)
    private static let flagsSetter = unsafeBitCast(functions[13], to: FlagsSetter.self)
    public static func getFlags(_ event: CGEvent) -> CGEventFlags { flagsGetter(event) }
    public static func setFlags(_ event: CGEvent, flags: CGEventFlags) { flagsSetter(event, flags) }

    private typealias LocationGetter = @convention(c) (CGEvent) -> CGPoint
    private typealias LocationSetter = @convention(c) (CGEvent, CGPoint) -> Void
    private static let locationGetter = unsafeBitCast(functions[5], to: LocationGetter.self)
    private static let locationSetter = unsafeBitCast(functions[15], to: LocationSetter.self)
    public static func getLocation(_ event: CGEvent) -> CGPoint { locationGetter(event) }
    public static func setLocation(_ event: CGEvent, location: CGPoint) { locationSetter(event, location) }

    private typealias TimestampGetter = @convention(c) (CGEvent) -> UInt64
    private typealias TimestampSetter = @convention(c) (CGEvent, UInt64) -> Void
    private static let timestampGetter = unsafeBitCast(functions[6], to: TimestampGetter.self)
    private static let timestampSetter = unsafeBitCast(functions[16], to: TimestampSetter.self)
    public static func getTimestamp(_ event: CGEvent) -> UInt64 { timestampGetter(event) }
    public static func setTimestamp(_ event: CGEvent, timestamp: UInt64) { timestampSetter(event, timestamp) }

    private typealias TypeGetter = @convention(c) (CGEvent) -> CGEventType
    private typealias TypeSetter = @convention(c) (CGEvent, CGEventType) -> Void
    private static let typeGetter = unsafeBitCast(functions[7], to: TypeGetter.self)
    private static let typeSetter = unsafeBitCast(functions[17], to: TypeSetter.self)
    public static func getType(_ event: CGEvent) -> CGEventType { typeGetter(event) }
    public static func setType(_ event: CGEvent, type: CGEventType) { typeSetter(event, type) }


    private typealias EventCreate = @convention(c) (CGEventSource?) -> Unmanaged<CGEvent>?
    private typealias KeyboardCreate = @convention(c) (CGEventSource?, UInt16, Bool) -> Unmanaged<CGEvent>?
    private typealias ScrollCreate = @convention(c) (CGEventSource?, CGScrollEventUnit, UInt32, Int32, Int32, Int32) -> Unmanaged<CGEvent>?
    private typealias SourceCreate = @convention(c) (CGEventSourceStateID) -> Unmanaged<CGEventSource>?
    private static let eventCreate = unsafeBitCast(functions[0], to: EventCreate.self)
    private static let keyboardCreate = unsafeBitCast(functions[1], to: KeyboardCreate.self)
    private static let scrollCreate = unsafeBitCast(functions[2], to: ScrollCreate.self)
    private static let sourceCreateBinding = unsafeBitCast(functions[18], to: SourceCreate.self)

    // Create-rule C functions return owned CF objects; transfer that ownership
    // into Swift exactly once. No extra retain or unretained adoption.
    public static func create(source: CGEventSource?) -> CGEvent? {
        eventCreate(source)?.takeRetainedValue()
    }
    public static func createKeyboardEvent(source: CGEventSource?, virtualKey: UInt16, keyDown: Bool) -> CGEvent? {
        keyboardCreate(source, virtualKey, keyDown)?.takeRetainedValue()
    }
    public static func createScrollWheelEvent(source: CGEventSource?, units: CGScrollEventUnit,
        wheelCount: UInt32, wheel1: Int32, wheel2: Int32, wheel3: Int32
    ) -> CGEvent? {
        scrollCreate(source, units, wheelCount, wheel1, wheel2, wheel3)?.takeRetainedValue()
    }
    public static func sourceCreate(stateID: CGEventSourceStateID) -> CGEventSource? {
        sourceCreateBinding(stateID)?.takeRetainedValue()
    }

    private typealias UnicodeGetter = @convention(c) (CGEvent, Int, UnsafeMutablePointer<Int>?, UnsafeMutablePointer<UInt16>?) -> Void
    private typealias UnicodeSetter = @convention(c) (CGEvent, Int, UnsafePointer<UInt16>?) -> Void
    private static let unflippedGetter = unsafeBitCast(functions[8], to: LocationGetter.self)
    private static let unicodeGetter = unsafeBitCast(functions[9], to: UnicodeGetter.self)
    private static let unicodeSetter = unsafeBitCast(functions[10], to: UnicodeSetter.self)

    public static func getUnflippedLocation(_ event: CGEvent) -> CGPoint {
        unflippedGetter(event)
    }
    public static func keyboardGetUnicodeString(_ event: CGEvent, maxStringLength: Int,
        actualStringLength: UnsafeMutablePointer<Int>?, unicodeString: UnsafeMutablePointer<UInt16>?
    ) {
        unicodeGetter(event, maxStringLength, actualStringLength, unicodeString)
    }
    // Original array payload pointer+32, explicit length unchanged. This wrapper
    // does not truncate to Array.count or add a new validation/error policy.
    public static func keyboardSetUnicodeString(_ event: CGEvent, stringLength: Int, unicodeString: [UInt16]) {
        unicodeString.withUnsafeBufferPointer { unicodeSetter(event, stringLength, $0.baseAddress) }
    }

    private typealias Post = @convention(c) (CGEventTapLocation, CGEvent) -> Void
    private typealias PostToPID = @convention(c) (Int32, CGEvent) -> Void
    private typealias SourceFlags = @convention(c) (CGEventSourceStateID) -> CGEventFlags
    private typealias TapCreate = @convention(c) (CGEventTapLocation, CGEventTapPlacement, CGEventTapOptions, UInt64, CGEventTapCallBack, UnsafeMutableRawPointer?) -> Unmanaged<CFMachPort>?
    private typealias TapCreateForPID = @convention(c) (Int32, CGEventTapPlacement, CGEventTapOptions, UInt64, CGEventTapCallBack, UnsafeMutableRawPointer?) -> Unmanaged<CFMachPort>?
    private typealias TapEnable = @convention(c) (CFMachPort, Bool) -> Void
    private typealias TapIsEnabled = @convention(c) (CFMachPort) -> Bool
    private static let postBinding = unsafeBitCast(functions[11], to: Post.self)
    private static let postToPIDBinding = unsafeBitCast(functions[12], to: PostToPID.self)
    private static let sourceFlagsBinding = unsafeBitCast(functions[19], to: SourceFlags.self)
    private static let tapCreateBinding = unsafeBitCast(functions[20], to: TapCreate.self)
    private static let tapCreateForPIDBinding = unsafeBitCast(functions[21], to: TapCreateForPID.self)
    private static let tapEnableBinding = unsafeBitCast(functions[22], to: TapEnable.self)
    private static let tapIsEnabledBinding = unsafeBitCast(functions[23], to: TapIsEnabled.self)

    // Original common thunk0x100258060 swaps Swift event/target into C order.
    public static func post(_ event: CGEvent, tap: CGEventTapLocation) { postBinding(tap, event) }
    public static func postToPid(_ event: CGEvent, pid: Int32) { postToPIDBinding(pid, event) }
    public static func sourceFlagsState(_ stateID: CGEventSourceStateID) -> CGEventFlags {
        sourceFlagsBinding(stateID)
    }
    public static func tapCreate(tap: CGEventTapLocation, place: CGEventTapPlacement,
        options: CGEventTapOptions, eventsOfInterest: UInt64, callback: CGEventTapCallBack,
        userInfo: UnsafeMutableRawPointer?
    ) -> CFMachPort? {
        tapCreateBinding(tap, place, options, eventsOfInterest, callback, userInfo)?.takeRetainedValue()
    }
    public static func tapCreateForPid(pid: Int32, place: CGEventTapPlacement,
        options: CGEventTapOptions, eventsOfInterest: UInt64, callback: CGEventTapCallBack,
        userInfo: UnsafeMutableRawPointer?
    ) -> CFMachPort? {
        tapCreateForPIDBinding(pid, place, options, eventsOfInterest, callback, userInfo)?.takeRetainedValue()
    }
    public static func tapEnable(tap: CFMachPort, enable: Bool) { tapEnableBinding(tap, enable) }
    public static func tapIsEnabled(tap: CFMachPort) -> Bool { tapIsEnabledBinding(tap) }

}
