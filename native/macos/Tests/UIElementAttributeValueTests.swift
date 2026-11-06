import Foundation

@main
struct AttributeValueTests {
    static func main() {
        var calls: [String] = []
        let empty: String? = uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: { "" }, uncachedValue: { _ in preconditionFailure("Cached empty string must not cause a native read") })
        precondition(empty == "")
        let flag: Bool? = uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: { false }, uncachedValue: { _ in preconditionFailure("Cached false must be preserved") })
        precondition(flag == false)
        let zero: Int? = uiElementAttributeValue(ignoringTypeMismatch: true, cachedValue: { 0 }, uncachedValue: { _ in preconditionFailure("Cached zero must be preserved") })
        precondition(zero == 0)
        for ignore in [false, true] {
            calls = []
            let value: String? = uiElementAttributeValue(ignoringTypeMismatch: ignore, cachedValue: { calls.append("cache"); return nil }, uncachedValue: { value in calls.append("native:\(value)"); return "live" })
            precondition(value == "live" && calls == ["cache", "native:\(ignore)"])
        }
        let missing: String? = uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: { nil }, uncachedValue: { _ in nil })
        precondition(missing == nil)
        let nested: String?? = uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: { Optional<String?>.some(nil) }, uncachedValue: { _ in preconditionFailure("A present generic optional value is still a hit") })
        if case .some(.none) = nested {} else { preconditionFailure("Nested optional lost") }
        calls = []
        let selection = selectedText(readAttribute: {
            uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: { calls.append("cache"); return "" }, uncachedValue: { _ in preconditionFailure("Empty cached attribute must reach selection fallback") })
        }, readMarkerRange: { calls.append("marker"); return 7 }, readStringForMarkerRange: { _ in calls.append("parameterized"); return "selection" })
        precondition(selection == "selection" && calls == ["cache", "marker", "parameterized"])
        print("8 native attribute dispatch cases passed")
    }
}
