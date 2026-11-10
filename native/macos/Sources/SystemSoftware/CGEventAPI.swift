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
}
