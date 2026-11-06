import ApplicationServices

// Concrete ScrollBar target of the original decoder (0x100712f58).
// Static role metadata does not imply an extra AXRole validation here.
func decodeAXScrollBar(
    _ raw: AnyObject,
    throwingOnFailure: Bool,
    transaction: UIElementTransactionCache?
) throws -> ScrollBarUIElement? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        return try unwrapAXElement(raw, throwingOnFailure: throwingOnFailure) {
            ScrollBarUIElement(systemElement: $0, transaction: transaction)
        }
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: ScrollBarUIElement.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: ScrollBarUIElement.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: ScrollBarUIElement.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(ScrollBarUIElement.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: ScrollBarUIElement.self)
}
