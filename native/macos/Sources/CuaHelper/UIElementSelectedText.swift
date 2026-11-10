import ApplicationServices

// UIElementProtocol.selectedText0x10078e7f0. Empty direct strings fall through
// to marker text; empty marker strings and parameterized errors become nil.
// No AXValue slicing or selected CFRange fallback exists in this getter.
func uiElementSelectedText<Marker>(readText: () -> String?, readMarkerRange: () -> Marker?,
    readMarkerText: (Marker) throws -> String?
) -> String? {
    if let text = readText(), !text.isEmpty { return text }
    guard let range = readMarkerRange(), let text = try? readMarkerText(range), !text.isEmpty else { return nil }
    return text
}

extension UIElementProtocol {
    var selectedText: String? {
        uiElementSelectedText(readText: {
            let attribute = UIElementAttribute("AXSelectedText")
            return stringValue(for: attribute, ignoringTypeMismatch: false,
                read: { axElement.value(for: attribute) }, reportError: reportAttributeReadError)
        }, readMarkerRange: { selectedTextMarkerRange }, readMarkerText: { range in
            let parameter = try AXEncodedValue(wrapping: range)
            guard let partial = try axElement.parameterizedValue(
                for: UIElementAttribute("AXStringForTextMarkerRange"), parameter: parameter) else { return nil }
            return try decodeAXString(partial.value.value, throwingOnFailure: true)
        })
    }
}
