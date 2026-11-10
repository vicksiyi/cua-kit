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


}
