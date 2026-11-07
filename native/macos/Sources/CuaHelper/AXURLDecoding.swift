import Foundation
import ApplicationServices

// URL specialization at 0x1007102c8. Ordinary values use Foundation bridging;
// strings are not parsed into URLs. Preserve the outer CF dispatch.
func decodeAXURL(_ raw: AnyObject, throwingOnFailure: Bool) throws -> URL? {
    let kind = CFGetTypeID(raw)
    if kind == AXUIElementGetTypeID() {
        if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(URL.self) }
        return nil
    }
    if kind == AXTextMarkerGetTypeID() {
        return try decodeAXTextMarker(raw as! AXTextMarker, throwingOnFailure: throwingOnFailure, as: URL.self)
    }
    if kind == AXTextMarkerRangeGetTypeID() {
        return try decodeAXTextMarkerRange(raw as! AXTextMarkerRange, throwingOnFailure: throwingOnFailure, as: URL.self)
    }
    if kind == AXValueGetTypeID() {
        return try decodeAXValue(raw as! AXValue, throwingOnFailure: throwingOnFailure, as: URL.self)
    }
    if kind == CFArrayGetTypeID() {
        _ = try resolvedAXArrayTarget(URL.self, throwingOnFailure: throwingOnFailure)
        return nil
    }
    return try decodeAXOrdinaryValue(raw, throwingOnFailure: throwingOnFailure, as: URL.self)
}
