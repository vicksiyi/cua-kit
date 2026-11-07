import ApplicationServices

// CFRange specialization at 0x1007111c8 -> 0x100712178. CFRange is neither an
// AXUIElement class, UIElementProtocol conformer nor TypeErasedArray target.
// Preserve CF dispatch before ordinary Foundation bridging.
func decodeAXRange(_ raw: AnyObject, throwingOnFailure: Bool) throws -> CFRange? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(CFRange.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: CFRange.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: CFRange.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: CFRange.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(CFRange.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: CFRange.self)
}
