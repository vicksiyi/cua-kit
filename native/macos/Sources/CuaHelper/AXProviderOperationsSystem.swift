import ApplicationServices

func isAXAttributeSettable(_ element: AXUIElement, _ attribute: UIElementAttribute) throws -> Bool {
    try providerAXAttributeSettable(element, attribute) { try isSystemAXAttributeSettable(element, attribute) }
}
func setAXAttribute(_ element: AXUIElement, _ value: AXEncodedValue, for attribute: UIElementAttribute) throws {
    try providerAXSetAttribute(element, value, for: attribute) {
        // 0x1006f7624 resolves actualPID before deciding whether to dispatch.
        let result: Result<Void, Error> = onAXProviderReadThread(element) {
            Result { try systemAXAttributeWriteResult(value, for: attribute) {
                AXUIElementSetAttributeValue(element, $0, $1)
            } }
        }
        try result.get()
    }
}
func readAXActions(_ element: AXUIElement) throws -> [UIElementAction] {
    try providerAXActions(element) { try readSystemAXActions(element) }
}
func readAXActionDescription(_ element: AXUIElement, for action: UIElementAction) throws -> String? {
    try providerAXActionDescription(element, for: action) { try readSystemAXActionDescription(element, for: action) }
}
func performAXAction(_ element: AXUIElement, _ action: UIElementAction) throws {
    try providerAXPerform(element, action) {
        // 0x1006f9b74 uses the same actualPID-aware synchronous routing.
        let result: Result<Void, Error> = onAXProviderReadThread(element) {
            Result { try systemAXActionResult {
                AXUIElementPerformAction(element, action.name as CFString)
            } }
        }
        try result.get()
    }
}
