import ApplicationServices

// Concrete UIElement target of the generic value decoder used by parent getter.
// Static role metadata does not imply an extra AXRole validation here.
func decodeAXUIElement(
    _ raw: AnyObject,
    throwingOnFailure: Bool,
    transaction: UIElementTransactionCache?
) throws -> UIElement? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        return try unwrapAXElement(raw, throwingOnFailure: throwingOnFailure) {
            UIElement(systemElement: $0, transaction: transaction)
        }
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: UIElement.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: UIElement.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: UIElement.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(UIElement.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: UIElement.self)
}
