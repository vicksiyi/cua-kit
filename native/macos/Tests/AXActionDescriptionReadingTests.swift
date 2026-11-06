import ApplicationServices

@main
struct AXActionDescriptionReadingTests {
    static func main() throws {
        for text in ["", "press", "展开", "e\u{301}", "one\nsecond"] {
            var calls = 0
            let value = try systemAXActionDescriptionResult {
                calls += 1
                $0 = text as CFString
                return .success
            }
            precondition(value.map { Array($0.utf8) } == Array(text.utf8))
            precondition(calls == 1)
        }
        let absent = try systemAXActionDescriptionResult { _ in .success }
        precondition(absent == nil)
        for status: AXError in [.noValue, .actionUnsupported, .attributeUnsupported,
                                .cannotComplete, .apiDisabled, .failure, .illegalArgument] {
            for hasOutput in [false, true] {
                var calls = 0
                do {
                    _ = try systemAXActionDescriptionResult {
                        calls += 1
                        if hasOutput { $0 = "ignored" as CFString }
                        return status
                    }
                    fatalError("non-success must throw even when description exists")
                } catch UIElementError.axError(let actual) {
                    precondition(actual == status && calls == 1)
                }
            }
        }
        print("native action descriptions preserve errors, nil and exact strings")
    }
}
