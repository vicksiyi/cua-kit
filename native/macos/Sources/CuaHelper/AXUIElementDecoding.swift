import ApplicationServices

// AXEncodedValue.unwrappedAXUIElementThrowing at 0x1006e9d90.
// A CF type-ID check must precede the forced class cast; Swift's conditional
// casting of opaque Core Foundation types alone is not a runtime type check.
func unwrapAXUIElement(_ value: AnyObject, throwingOnFailure: Bool) throws -> AXUIElement? {
    if CFGetTypeID(value) == AXUIElementGetTypeID() {
        return (value as! AXUIElement)
    }
    if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(AXUIElement.self) }
    return nil
}
