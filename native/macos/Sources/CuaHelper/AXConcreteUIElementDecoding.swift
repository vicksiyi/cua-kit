import ApplicationServices

// Concrete UIElement target of the generic value decoder used by parent getter.
// Static role metadata does not imply an extra AXRole validation here.
func decodeAXUIElement(
    _ raw: AnyObject,
    throwingOnFailure: Bool,
    transaction: UIElementTransactionCache?
) throws -> UIElement? {
    try decodeAXUIElement(raw, throwingOnFailure: throwingOnFailure,
        initialize: { UIElement(systemElement: $0, transaction: transaction) })
}

// Shared type-dispatch body. The original generic decoder calls the target
// initializer witness; the legacy explicit transaction adapter above is separate.
func decodeAXUIElement(
    _ raw: AnyObject,
    throwingOnFailure: Bool,
    initialize: (AXUIElement) -> UIElement
) throws -> UIElement? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        return try unwrapAXElement(raw, throwingOnFailure: throwingOnFailure, initialize: initialize)
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
