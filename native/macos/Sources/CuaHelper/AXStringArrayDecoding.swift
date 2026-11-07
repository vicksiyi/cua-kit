import Foundation
import ApplicationServices

// 0x100711208 specializes the generic decoder with SaySSG ([String]).
// Outer strictness does not propagate to compactMap's element decoder.
func decodeAXStringArray(_ raw: AnyObject, throwingOnFailure: Bool) throws -> [String]? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue([String].self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: [String].self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: [String].self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: [String].self)
    }
    if kind == CFArrayGetTypeID() {
        guard let values = raw as? [AnyObject] else {
            if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue([String].self) }
            return nil
        }
        let strings = decodeAXArrayElements(values) {
            try? decodeAXString($0, throwingOnFailure: false)
        }
        return try convertedAXArray(strings, as: [String].self, throwingOnFailure: throwingOnFailure)
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: [String].self)
}

extension UIElement {
    // Constructor 0x10075f460..<0x10075f514: cached only. A missing/bad
    // outer value is nil, but an array with no decodable elements is [].
    var transformedDOMClassList: [String]? {
        uiElementCachedValue(UIElementAttribute("AXDOMClassList"), readCache: { cache }) {
            try? decodeAXStringArray($0.value.value, throwingOnFailure: false)
        }
    }
}
