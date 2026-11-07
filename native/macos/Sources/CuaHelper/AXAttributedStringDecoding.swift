import Foundation
import ApplicationServices

// NSAttributedString specialization 0x1007144ac -> 0x1007144d0.
// Preserve special CF dispatch; plain strings are not promoted to rich text.
func decodeAXAttributedString(_ raw: AnyObject, throwingOnFailure: Bool) throws -> NSAttributedString? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(NSAttributedString.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: NSAttributedString.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: NSAttributedString.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: NSAttributedString.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(NSAttributedString.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: NSAttributedString.self)
}
