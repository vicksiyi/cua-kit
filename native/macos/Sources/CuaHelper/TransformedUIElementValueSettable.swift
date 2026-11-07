// Constructor 0x10075e808..0x10075e860 and 0x10075edb4..0x10075f13c.
// The Chromium predicate stays an explicit dependency until its extra role
// argument is traced through every construction entry point.
private let transformedEventValueSettableRoles: Set<UIElementRole> = [
    UIElementRole("AXComboBox"), UIElementRole("AXDateField"),
    UIElementRole("AXDateTimeArea"), UIElementRole("AXIncrementor"),
    UIElementRole("AXSlider"), .textArea, .textField, UIElementRole("AXTimeField"),
]

func transformedUIElementValueSettable(
    contextType: UIElementContextType,
    isChromium: Bool,
    role: UIElementRole,
    chromiumAllowsValue: () -> Bool,
    readSupportedAndSettable: () -> Bool
) -> Bool {
    if isChromium && !chromiumAllowsValue() { return false }
    if contextType == .eventStreamContext { return transformedEventValueSettableRoles.contains(role) }
    return readSupportedAndSettable()
}

extension UIElement {
    func transformedValueSettable(contextType: UIElementContextType, isChromium: Bool,
        chromiumAllowsValue: () -> Bool
    ) -> Bool {
        transformedUIElementValueSettable(contextType: contextType, isChromium: isChromium,
            role: role, chromiumAllowsValue: chromiumAllowsValue,
            readSupportedAndSettable: {
                uiElementIsAttributeSupportedAndSettable(UIElementAttribute("AXValue"),
                    readCache: { cache },
                    freshSupportedAttributes: { Set(axElement.supportedAttributes) },
                    isAttributeSettable: { try axElement.isAttributeSettable($0) })
            })
    }
}
