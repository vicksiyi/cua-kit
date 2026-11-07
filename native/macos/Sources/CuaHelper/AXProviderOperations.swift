import ApplicationServices

// Resolved-object slots +0x38/+0x40/+0x60/+0x68/+0x70. All are throwing,
// including the actions getter. Mock results are not normalized as OS results.
func providerAXAttributeSettable(_ element: AXUIElement, _ attribute: UIElementAttribute,
    system: () throws -> Bool
) throws -> Bool {
    try withAXProvider(element, mock: { try $0.isAttributeSettable(attribute) }, system: system)
}
func providerAXSetAttribute(_ element: AXUIElement, _ value: AXEncodedValue,
    for attribute: UIElementAttribute, system: () throws -> Void
) throws {
    try withAXProvider(element, mock: { try $0.setValue(value, forAttribute: attribute) }, system: system)
}
func providerAXActions(_ element: AXUIElement, system: () throws -> [UIElementAction]) throws -> [UIElementAction] {
    try withAXProvider(element, mock: { try $0.actions }, system: system)
}
func providerAXActionDescription(_ element: AXUIElement, for action: UIElementAction,
    system: () throws -> String?
) throws -> String? {
    try withAXProvider(element, mock: { try $0.description(for: action) }, system: system)
}
func providerAXPerform(_ element: AXUIElement, _ action: UIElementAction,
    system: () throws -> Void
) throws {
    try withAXProvider(element, mock: { try $0.perform(action) }, system: system)
}
