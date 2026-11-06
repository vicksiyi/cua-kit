import ApplicationServices

// String specialization at 0x100710b44..0x1007111c8. String is neither an
// AXUIElement class, UIElementProtocol conformer nor TypeErasedArray target.
// Preserve CF dispatch before ordinary Foundation bridging.
func decodeAXString(_ raw: AnyObject, throwingOnFailure: Bool) throws -> String? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(String.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: String.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: String.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: String.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(String.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: String.self)
}

extension UIElement {
    // Witness 0x1007aff6c: reads only the cached AXSubrole entry. Descriptors
    // do not participate, and decode errors are suppressed at this boundary.
    var subrole: String? {
        guard let partial = cache.attributes[UIElementAttribute(kAXSubroleAttribute)] else { return nil }
        return try? decodeAXString(partial.value.value, throwingOnFailure: false)
    }
}
