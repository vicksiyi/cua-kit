// Cached String fields from the common TransformedUIElement constructor.
// This is a local grouping, not a recovered standalone vendor type.
struct TransformedUIElementCachedStrings {
    let subrole: String?
    let roleDescription: String?
    let title: String?
    let description: String?
    let valueDescription: String?
    let placeholderValue: String?
    let help: String?
    let identifier: String?
}

extension UIElement {
    func transformedCachedStrings() -> TransformedUIElementCachedStrings {
        // Each source branch uses cached partial values and lenient String
        // decoding. Missing/bad values stay nil; no fresh provider fallback.
        .init(subrole: cachedStringValue(for: UIElementAttribute("AXSubrole")),
            roleDescription: cachedStringValue(for: UIElementAttribute("AXRoleDescription")),
            title: cachedStringValue(for: UIElementAttribute("AXTitle")),
            description: cachedStringValue(for: UIElementAttribute("AXDescription")),
            valueDescription: cachedStringValue(for: UIElementAttribute("AXValueDescription")),
            placeholderValue: cachedStringValue(for: UIElementAttribute("AXPlaceholderValue")),
            help: cachedStringValue(for: UIElementAttribute("AXHelp")),
            identifier: cachedStringValue(for: UIElementAttribute("AXIdentifier")))
    }
}
