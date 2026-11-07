import Foundation
import ApplicationServices

// UITextMarkerRange specialization at 0x100715324. Preserve outer CF dispatch.
func decodeAXMarkerRange(_ raw: AnyObject, throwingOnFailure: Bool) throws -> UITextMarkerRange? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(UITextMarkerRange.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: UITextMarkerRange.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: UITextMarkerRange.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: UITextMarkerRange.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(UITextMarkerRange.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: UITextMarkerRange.self)
}
