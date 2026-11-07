import ApplicationServices

// Int specialization at 0x100711234 -> 0x100711258 (Int metadata GOT 0x101466A30). Int is neither an
// AXUIElement class, UIElementProtocol conformer nor TypeErasedArray target.
// Preserve CF dispatch before ordinary Foundation bridging.
func decodeAXInt(_ raw: AnyObject, throwingOnFailure: Bool) throws -> Int? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(Int.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: Int.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: Int.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: Int.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(Int.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: Int.self)
}
