import ApplicationServices

@main
struct AXValueDecodingTests {
    static func boxed<Value>(_ type: AXValueType, _ value: Value) -> AXValue {
        var copy = value
        return withUnsafePointer(to: &copy) { AXValueCreate(type, $0)! }
    }
    static func main() throws {
        let point = CGPoint(x: 3, y: -4)
        let encodedPoint = boxed(.cgPoint, point)
        for strict in [false, true] {
            let decoded: CGPoint? = try decodeAXValue(encodedPoint, throwingOnFailure: strict)
            precondition(decoded == point)
            let decodedAny: Any? = try decodeAXValue(encodedPoint, throwingOnFailure: strict)
            precondition(decodedAny as? CGPoint == point)
            // A compatible AXError/Any target wins, even for .noValue.
            let noValue = boxed(.axError, AXError.noValue)
            let error: AXError? = try decodeAXValue(noValue, throwingOnFailure: strict)
            precondition(error == .noValue)
            let anyError: Any? = try decodeAXValue(noValue, throwingOnFailure: strict)
            precondition(anyError as? AXError == .noValue)
            let missing: String? = try decodeAXValue(noValue, throwingOnFailure: strict)
            precondition(missing == nil)
            let nested: CGPoint?? = try decodeUnpackedAXValue(throwingOnFailure: strict, as: CGPoint?.self) { nil }
            guard case .some(.none) = nested else { fatalError("Preserve successful nil Optional cast") }
        }
        let mismatch: String? = try decodeAXValue(encodedPoint, throwingOnFailure: false)
        precondition(mismatch == nil)
        do {
            let _: String? = try decodeAXValue(encodedPoint, throwingOnFailure: true)
            preconditionFailure("Expected failed unwrap")
        } catch UIElementError.failedToUnwrapAttributeValue(let type) { precondition(type == String.self) }
        for error in [AXError.success, .failure, .cannotComplete] {
            let encoded = boxed(.axError, error)
            let result: CGPoint? = try decodeAXValue(encoded, throwingOnFailure: false)
            precondition(result == nil)
            do {
                let _: CGPoint? = try decodeAXValue(encoded, throwingOnFailure: true)
                preconditionFailure("Expected AX error, including raw success when not requested as AXError")
            } catch UIElementError.axError(let actual) { precondition(actual == error) }
        }
        for strict in [false, true] {
            do {
                let _: String? = try decodeUnpackedAXValue(throwingOnFailure: strict, as: String.self) {
                    throw UIElementError.failedToUnwrapAttributeValue(AXValue.self)
                }
                preconditionFailure("Lower unpacker errors must propagate regardless of flag")
            } catch UIElementError.failedToUnwrapAttributeValue(let type) { precondition(type == AXValue.self) }
        }
        print("22 native AXValue decoding cases passed")
    }
}
