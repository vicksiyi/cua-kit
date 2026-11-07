import ApplicationServices

// CGPoint specialization at 0x100712814 -> 0x100712178. CGPoint is neither an
// AXUIElement class, UIElementProtocol conformer nor TypeErasedArray target.
// Preserve CF dispatch before ordinary Foundation bridging.
func decodeAXPoint(_ raw: AnyObject, throwingOnFailure: Bool) throws -> CGPoint? {
    try decodeAXPointTarget(raw, throwingOnFailure: throwingOnFailure, as: CGPoint.self)
}

func decodeAXOptionalPoint(_ raw: AnyObject, throwingOnFailure: Bool) throws -> CGPoint?? {
    try decodeAXPointTarget(raw, throwingOnFailure: throwingOnFailure, as: CGPoint?.self)
}

private func decodeAXPointTarget<Value>(_ raw: AnyObject, throwingOnFailure: Bool, as type: Value.Type) throws -> Value? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(type) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: type)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: type)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: type)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(type, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: type)
}
