import ApplicationServices

// System branch at 0x1006f7434–0x1006f7490. Unlike value reads this path does
// not dispatch to the target PID's main thread. MockProvider selection remains
// outside this explicit system adapter.
func systemAXAttributeSettableResult(
    query: (inout DarwinBoolean) -> AXError
) throws -> Bool {
    var settable = DarwinBoolean(false)
    let status = query(&settable)
    guard status == .success else { throw UIElementError.axError(status) }
    return settable.boolValue
}

func isSystemAXAttributeSettable(
    _ element: AXUIElement, _ attribute: UIElementAttribute
) throws -> Bool {
    try systemAXAttributeSettableResult {
        AXUIElementIsAttributeSettable(element, attribute.name, &$0)
    }
}
