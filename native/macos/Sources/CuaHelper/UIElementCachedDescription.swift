extension UIElementProtocol {
    var flattenedRole: UIElementFlattenedRole? { uiElementFlattenedRole(role: { role }) }

    var hasDescriptiveAttributes: Bool {
        uiElementHasDescriptiveAttributes(
            title: { cachedStringValue(for: UIElementAttribute("AXTitle")) },
            description: { cachedStringValue(for: UIElementAttribute("AXDescription")) },
            value: { cachedStringValue(for: UIElementAttribute("AXValue")) },
            placeholder: { cachedStringValue(for: UIElementAttribute("AXPlaceholderValue")) },
            role: { role })
    }
}
