import ApplicationServices

// UInt64 specialization at generic value reader requested by traits at 0x1007afa0c. UInt64 is neither an
// AXUIElement class, UIElementProtocol conformer nor TypeErasedArray target.
// Preserve CF dispatch before ordinary Foundation bridging.
func decodeAXUInt64(_ raw: AnyObject, throwingOnFailure: Bool) throws -> UInt64? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(UInt64.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: UInt64.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: UInt64.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: UInt64.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(UInt64.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: UInt64.self)
}
