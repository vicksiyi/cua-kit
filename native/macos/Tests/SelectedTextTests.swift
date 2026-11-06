import Foundation

@main
struct SelectedTextTests {
    enum FixtureError: Error { case unavailable }
    static func main() {
        // Expected call order and empty/error handling come from the reviewed
        // native getter. These fixtures do not execute the proprietary service.
        let cases: [(String?, Int?, String?, Bool, String?, [String])] = [
            ("selected", 7, "fallback", false, "selected", ["attribute"]),
            (" \n", 7, "fallback", false, " \n", ["attribute"]),
            ("", 7, "标记文本", false, "标记文本", ["attribute", "marker", "string:7"]),
            (nil, 7, "fallback", false, "fallback", ["attribute", "marker", "string:7"]),
            (nil, nil, "unused", false, nil, ["attribute", "marker"]),
            ("", nil, "unused", false, nil, ["attribute", "marker"]),
            (nil, 7, "", false, nil, ["attribute", "marker", "string:7"]),
            (nil, 7, nil, false, nil, ["attribute", "marker", "string:7"]),
            (nil, 7, "unused", true, nil, ["attribute", "marker", "string:7"]),
        ]
        for (direct, marker, fallback, shouldThrow, expected, expectedCalls) in cases {
            var calls: [String] = []
            let result = selectedText(
                readAttribute: { calls.append("attribute"); return direct },
                readMarkerRange: { calls.append("marker"); return marker },
                readStringForMarkerRange: { value in
                    calls.append("string:\(value)")
                    if shouldThrow { throw FixtureError.unavailable }
                    return fallback
                }
            )
            precondition(result == expected && calls == expectedCalls)
        }
        let selection = selectedText(readAttribute: { "" }, readMarkerRange: { Optional<Int>.none }, readStringForMarkerRange: { _ in "unused" })
        let presentation = AccessibilityTreePresentation(body: "body", focusedElement: "[2]", selectedText: selection, selectedElements: [])
        precondition(presentation.text == "body\nThe focused UI element is [2]")
        print("10 native selected-text cases passed")
    }
}
