import ApplicationServices

func isAXAttributeSettable(_ element: AXUIElement, _ attribute: UIElementAttribute) throws -> Bool {
    try providerAXAttributeSettable(element, attribute) { try isSystemAXAttributeSettable(element, attribute) }
}
func setAXAttribute(_ element: AXUIElement, _ value: AXEncodedValue, for attribute: UIElementAttribute) throws {
    try providerAXSetAttribute(element, value, for: attribute) { try setSystemAXAttribute(element, value, for: attribute) }
}
func readAXActions(_ element: AXUIElement) throws -> [UIElementAction] {
    try providerAXActions(element) { try readSystemAXActions(element) }
}
func readAXActionDescription(_ element: AXUIElement, for action: UIElementAction) throws -> String? {
    try providerAXActionDescription(element, for: action) { try readSystemAXActionDescription(element, for: action) }
}
func performAXAction(_ element: AXUIElement, _ action: UIElementAction) throws {
    try providerAXPerform(element, action) { try performSystemAXAction(element, action) }
}
