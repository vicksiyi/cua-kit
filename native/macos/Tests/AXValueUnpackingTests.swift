import ApplicationServices

@main
struct AXValueUnpackingTests {
    static func boxed<Value>(_ type: AXValueType, _ value: Value) -> AXValue {
        var copy = value
        return withUnsafePointer(to: &copy) { AXValueCreate(type, $0)! }
    }
    static func main() throws {
        let point = CGPoint(x: -12.5, y: 42.25)
        precondition(tryValue(boxed(.cgPoint, point)) as? CGPoint == point)
        let size = CGSize(width: 0, height: 55.5)
        precondition(tryValue(boxed(.cgSize, size)) as? CGSize == size)
        let rect = CGRect(x: -20, y: 4, width: 12.5, height: 7)
        precondition(tryValue(boxed(.cgRect, rect)) as? CGRect == rect)
        let range = tryValue(boxed(.cfRange, CFRange(location: 3, length: 17))) as! CFRange
        precondition(range.location == 3 && range.length == 17)
        for error in [AXError.success, .noValue] {
            // noValue is still an AXError here. Its optional-value policy belongs
            // to the enclosing AXEncodedValue decoder, not this unpacker.
            precondition(tryValue(boxed(.axError, error)) as? AXError == error)
        }
        for type in [AXValueType.cgPoint, .cgSize, .cgRect, .cfRange, .axError] {
            var calls = 0
            let value = try unpackAXValue(type: type) { requested, _ in
                precondition(requested == type)
                calls += 1
                return false
            }
            precondition(value == nil && calls == 1)
        }
        do {
            _ = try unpackAXValue(type: .illegal) { _, _ in preconditionFailure("Unsupported type must not read memory") }
            preconditionFailure("Expected typed unwrap error")
        } catch UIElementError.failedToUnwrapAttributeValue(let type) {
            precondition(type == AXValue.self)
        }
        print("12 native AXValue unpacking cases passed")
    }
    static func tryValue(_ value: AXValue) -> Any? { try! unpackAXValue(value) }
}
