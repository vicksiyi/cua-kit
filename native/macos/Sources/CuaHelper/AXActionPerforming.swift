import ApplicationServices

// Native perform's system branch ignores cannotComplete and attributeUnsupported
// in addition to success. A nonthrowing return is not proof of a visible effect.
func systemAXActionResult(perform: () -> AXError) throws {
    let status = perform()
    guard status == .success || status == .cannotComplete || status == .attributeUnsupported else {
        throw UIElementError.axError(status)
    }
}

// static optional MockProvider dispatch is not included. The original system branch
// runs same-process AX actions on the main thread, as ordinary attribute reads do.
func performSystemAXAction(_ element: AXUIElement, _ action: UIElementAction) throws {
    let targetPID = resolvedAXProcessID(element)
    try onAXAttributeReadThread(targetPID: targetPID) {
        try systemAXActionResult {
            AXUIElementPerformAction(element, action.name as CFString)
        }
    }
}
