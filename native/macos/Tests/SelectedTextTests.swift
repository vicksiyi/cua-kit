import Foundation
import ApplicationServices

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
        runComposedSelectionChecks()
        print("10 native selected-text cases and 10 composed marker pipeline cases passed")
    }
    static func runComposedSelectionChecks() {
        let bytes: [UInt8] = [1, 0, 255]
        let marker = bytes.withUnsafeBufferPointer { AXTextMarkerCreate(nil, $0.baseAddress!, $0.count) }
        let range = AXTextMarkerRangeCreate(nil, marker, marker)
        // Only the native attribute response is substituted. Wrapping, parameter
        // encoding, AX status handling, decoding and selectedText are real code.
        let cases: [(String?, AnyObject?, AXError, AnyObject?, String?, [String])] = [
            ("direct", range, .success, "unused" as NSString, "direct", ["attribute"]),
            (" \n", range, .success, "unused" as NSString, " \n", ["attribute"]),
            (nil, range, .success, "选中🌍" as NSString, "选中🌍", ["attribute", "marker", "parameter", "decode"]),
            ("", range, .success, "fallback" as NSString, "fallback", ["attribute", "marker", "parameter", "decode"]),
            (nil, nil, .success, "unused" as NSString, nil, ["attribute", "marker"]),
            (nil, "wrong marker" as NSString, .success, "unused" as NSString, nil, ["attribute", "marker"]),
            (nil, range, .cannotComplete, "must not decode" as NSString, nil, ["attribute", "marker", "parameter"]),
            (nil, range, .success, nil, nil, ["attribute", "marker", "parameter"]),
            (nil, range, .success, "" as NSString, nil, ["attribute", "marker", "parameter", "decode"]),
            (nil, range, .success, NSNumber(value: 3), nil, ["attribute", "marker", "parameter", "decode"]),
        ]
        for (direct, rawMarker, status, rawOutput, expected, expectedCalls) in cases {
            var calls: [String] = []
            let value = selectedText(
                readAttribute: { calls.append("attribute"); return direct },
                readMarkerRange: {
                    calls.append("marker")
                    guard let rawMarker else { return Optional<UITextMarkerRange>.none }
                    return decodedAXTextMarkerAttribute(rawMarker, as: UITextMarkerRange.self)
                },
                readStringForMarkerRange: { wrapped in
                    let parameter = encodedAXParameter(wrapped)
                    precondition(parameter === range)
                    let raw = try rawAXParameterizedAttributeResult { output in
                        calls.append("parameter")
                        output = rawOutput
                        return status
                    }
                    guard let raw else { return nil }
                    calls.append("decode")
                    return try decodeAXOrdinaryValue(raw, throwingOnFailure: true, as: String.self)
                }
            )
            precondition(value == expected && calls == expectedCalls)
            let presentation = AccessibilityTreePresentation(body: "tree", focusedElement: "[2]", selectedText: value, selectedElements: [])
            if let expected {
                precondition(presentation.text.contains("Selected text: ```\n" + expected + "\n```"))
            } else {
                precondition(presentation.text == "tree\nThe focused UI element is [2]")
            }
        }
    }

}
