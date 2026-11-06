import ApplicationServices

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
            return initialize(value as! AXUIElement)
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
