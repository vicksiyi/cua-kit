// AccessibilityNode.hasDescriptiveAttributes, 0x100624fec..<0x100625204.
// The four concrete UIElement witness sources are AXTitle, AXDescription,
// AXValue and AXPlaceholderValue, in that order. Do not trim or eagerly read.
func uiElementHasDescriptiveAttributes(
    title: () -> String?,
    description: () -> String?,
    value: () -> String?,
    placeholder: () -> String?,
    role: () -> UIElementRole
) -> Bool {
    if let text = title(), !text.isEmpty { return true }
    if let text = description(), !text.isEmpty { return true }
    if let text = value(), !text.isEmpty { return true }
    if let text = placeholder(), !text.isEmpty { return true }
    return role() == .image
}
