import ApplicationServices

// unwrappedElementThrowing at 0x1006e9e50..<0x1006ea098. The caller supplies
// the original UIElementProtocol initializer witness, without a fake protocol.
// No AXRole read/validation occurs in this function.
func unwrapAXElement<Element>(
    _ raw: AnyObject,
    throwingOnFailure: Bool,
    initialize: (AXUIElement) -> Element
) throws -> Element? {
    guard CFGetTypeID(raw) == AXUIElementGetTypeID() else {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(AXUIElement.self) }
        return nil
    }
    let ax = raw as! AXUIElement
    if let existing = ax as? Element { return existing }
    return initialize(ax)
}
