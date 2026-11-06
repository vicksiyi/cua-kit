import ApplicationServices

@main
struct AXActionReadingTests {
    static func main() throws {
        let input = ["AXPress", "AXShowMenu", "AXPress", "é", "e\u{301}", "axpress", "", ""]
        let result = try systemAXActionsResult { $0 = input as CFArray; return .success }
        precondition(result.map(\.name) == ["AXPress", "AXShowMenu", "é", "axpress", ""])
        precondition(Array(result[2].name.utf8) == Array("é".utf8))
        let mixed = try systemAXActionsResult { $0 = ["AXPress", NSNumber(value: 1)] as CFArray; return .success }
        precondition(mixed.isEmpty)
        let absent = try systemAXActionsResult { _ in .success }
        let empty = try systemAXActionsResult { $0 = [] as CFArray; return .success }
        precondition(absent.isEmpty && empty.isEmpty)
        for status: AXError in [.noValue, .attributeUnsupported, .cannotComplete, .apiDisabled, .failure] {
            var calls = 0
            do {
                _ = try systemAXActionsResult { output in
                    calls += 1; output = ["AXPress"] as CFArray; return status
                }
                fatalError("non-success must throw even with names")
            } catch UIElementError.axError(let actual) {
                precondition(actual == status && calls == 1)
            }
        }
        print("native system actions preserve status, whole-array bridging and stable uniqueness")
    }
}
