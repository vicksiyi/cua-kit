import Foundation
import ApplicationServices

// UITextMarker specialization at 0x100714cd4. Preserve outer CF dispatch.
func decodeAXMarker(_ raw: AnyObject, throwingOnFailure: Bool) throws -> UITextMarker? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(UITextMarker.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: UITextMarker.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: UITextMarker.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: UITextMarker.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(UITextMarker.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: UITextMarker.self)
}
