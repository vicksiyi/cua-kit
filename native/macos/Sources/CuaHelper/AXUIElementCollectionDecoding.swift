import ApplicationServices

// Requested target is [UIElement]. Preserve the original outer CF dispatch;
// strictness affects the outer conversion, not compactMap's individual items.
func decodeUIElementArray(
    _ raw: AnyObject,
    throwingOnFailure: Bool,
    initialize: (AXUIElement) -> UIElement
) throws -> [UIElement]? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue([UIElement].self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: [UIElement].self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: [UIElement].self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: [UIElement].self)
    }
    if kind == CFArrayGetTypeID() {
        if let result = decodeCFUIElementArray(raw, initialize: initialize) { return result }
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue([UIElement].self) }
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: [UIElement].self)
}

// Concrete CFArray -> [UIElement] branch of the original array decoder.
// Caller provides the original element initializer's transaction/cache context.
// This is not the full AXEncodedValue decoder or the AXChildren attribute reader.
func decodeCFUIElementArray(
    _ raw: AnyObject,
    initialize: (AXUIElement) -> UIElement
) -> [UIElement]? {
    guard CFGetTypeID(raw) == CFArrayGetTypeID(),
          let values = raw as? [AnyObject] else { return nil }
    let decoded = decodeAXArrayElements(values) { value -> UIElement? in
        let kind = CFGetTypeID(value)
        if kind == AXUIElementGetTypeID() {
            return try? unwrapAXElement(value, throwingOnFailure: false, initialize: initialize)
        }
        if kind == AXTextMarkerGetTypeID() {
            return try? decodeAXTextMarker(value as! AXTextMarker, throwingOnFailure: false, as: UIElement.self)
        }
        if kind == AXTextMarkerRangeGetTypeID() {
            return try? decodeAXTextMarkerRange(value as! AXTextMarkerRange, throwingOnFailure: false, as: UIElement.self)
        }
        if kind == AXValueGetTypeID() {
            return try? decodeAXValue(value as! AXValue, throwingOnFailure: false, as: UIElement.self)
        }
        if kind == CFArrayGetTypeID() { return nil }
        return try? decodeAXOrdinaryValue(value, throwingOnFailure: false, as: UIElement.self)
    }
    return try? convertedAXArray(decoded, as: [UIElement].self, throwingOnFailure: false)
}
