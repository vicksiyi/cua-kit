import ApplicationServices

extension UIElement {
    // Shared cache-only String getter 0x1007ab5dc..<0x1007ab724;
    // entry points title 0x1007ab72c, description 0x1007ab750,
    // value 0x1007ab774, valueDescription 0x1007ab798.
    // No fresh read, stringification, trimming or empty-string fallback here.
    // These entries use the same String-specialized cache helper:
    // roleDescription 0x1007ab5c0, help 0x1007ab7bc, identifier 0x1007ab7e0,
    // placeholderValue 0x1007ad1e8.
    var roleDescription: String? { cachedStringValue(for: UIElementAttribute(kAXRoleDescriptionAttribute)) }
    var help: String? { cachedStringValue(for: UIElementAttribute(kAXHelpAttribute)) }
    var identifier: String? { cachedStringValue(for: UIElementAttribute(kAXIdentifierAttribute)) }
    var placeholderValue: String? { cachedStringValue(for: UIElementAttribute(kAXPlaceholderValueAttribute)) }
    var title: String? { cachedStringValue(for: UIElementAttribute(kAXTitleAttribute)) }
    var description: String? { cachedStringValue(for: UIElementAttribute(kAXDescriptionAttribute)) }
    var value: String? { cachedStringValue(for: UIElementAttribute(kAXValueAttribute)) }
    var valueDescription: String? { cachedStringValue(for: UIElementAttribute(kAXValueDescriptionAttribute)) }
}
