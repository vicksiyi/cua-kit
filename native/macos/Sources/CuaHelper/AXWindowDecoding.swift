import ApplicationServices

// Concrete Window target of the original decoder (0x100712f84).
// Static role metadata does not imply an extra AXRole validation here.
func decodeAXWindow(_ raw: AnyObject, throwingOnFailure: Bool,
    initialize: (AXUIElement) -> WindowUIElement
) throws -> WindowUIElement? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        return try unwrapAXElement(raw, throwingOnFailure: throwingOnFailure, initialize: initialize)
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: WindowUIElement.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: WindowUIElement.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: WindowUIElement.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(WindowUIElement.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: WindowUIElement.self)
}
