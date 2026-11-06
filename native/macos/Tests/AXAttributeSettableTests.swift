import ApplicationServices

@main
struct AXAttributeSettableTests {
    static func main() throws {
        let unwritten = try systemAXAttributeSettableResult { output in
            precondition(!output.boolValue)
            return .success
        }
        precondition(!unwritten)
        for value in [false, true] {
            var calls = 0
            let result = try systemAXAttributeSettableResult {
                calls += 1; $0 = DarwinBoolean(value); return .success
            }
            precondition(result == value && calls == 1)
            for status: AXError in [.noValue, .attributeUnsupported, .cannotComplete,
                                    .apiDisabled, .failure, .illegalArgument, .invalidUIElement] {
                calls = 0
                do {
                    _ = try systemAXAttributeSettableResult {
                        calls += 1; $0 = DarwinBoolean(value); return status
                    }
                    fatalError("non-success must throw regardless of the output bit")
                } catch UIElementError.axError(let actual) {
                    precondition(actual == status && calls == 1)
                }
            }
        }
        print("native writability preserves success bits and all AX errors")
    }
}
