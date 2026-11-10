import ApplicationServices

// NSNumber wrapper0x100713e78 -> generic decoder0x1007144d0. NSNumber is neither an
// AXUIElement class, UIElementProtocol conformer nor TypeErasedArray target.
// Preserve CF dispatch before ordinary Foundation bridging.
func decodeAXNumber(_ raw: AnyObject, throwingOnFailure: Bool) throws -> NSNumber? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(NSNumber.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: NSNumber.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: NSNumber.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: NSNumber.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(NSNumber.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: NSNumber.self)
}
