import ApplicationServices
import Foundation

func testCachedEnabledAndFocus() {
    enum Failure: Error { case query }
    let focused = UIElementAttribute("AXFocused")
    let enabled = UIElementAttribute("AXEnabled")
    let role = UIElementAttribute("AXRole")
    let cases: [(AnyObject?, Bool)] = [
        (nil, true), (NSNumber(value: true), true), (NSNumber(value: false), false),
        ("false" as NSString, true), (NSArray(), true),
        (AXUIElementCreateApplication(424242), true),
    ]
    var checked = 0
    for (raw, expectedEnabled) in cases {
        for roleName in ["AXTextField", "AXTextArea", "AXDateTimeArea", "AXButton"] {
            for supported in [false, true] {
                for query in 0..<3 { // false, true, error
                    var attributes: [UIElementAttribute: AXPartialValue] = [:]
                    for (key, value) in [(enabled, raw), (role, roleName as NSString)] {
                        if let value {
                            attributes[key] = AXPartialValue(value: AXEncodedValue(value: value),
                                arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
                        }
                    }
                    let element = UIElement(axElement: AXUIElementCreateApplication(424242),
                        cache: UIElementCache(supportedAttributes: supported ? [focused] : [],
                            attributes: attributes, transactionAttributes: [focused]))
                    precondition(element.isEnabled == expectedEnabled)
                    var calls = 0
                    let actual = element.isFocusable(freshSupportedAttributes: {
                        fatalError("Cached support must not trigger a fresh system read")
                    }, isAttributeSettable: { attribute in
                        precondition(attribute == focused)
                        calls += 1
                        if query == 2 { throw Failure.query }
                        return query == 1
                    })
                    let expected = supported && (query == 2
                        ? roleName != "AXButton" && expectedEnabled : query == 1)
                    precondition(actual == expected)
                    precondition(calls == (supported ? 1 : 0))
                    checked += 1
                }
            }
        }
    }
    precondition(checked == 144)
    print("cached enabled and focus composition preserves defaults, support gate and error fallback: 144 cases")
}
