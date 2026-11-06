import Foundation
import ApplicationServices

// AXChildren integration of the recovered compactMap and AXUIElement type-ID
// checks, [AnyObject] bridge and final target conversion. The requested target
// is fixed here; the complete generic decoder dispatch remains separate.
func unwrapAXUIElementArray(_ value: AnyObject) -> [AXUIElement]? {
    guard CFGetTypeID(value) == CFArrayGetTypeID() else { return nil }
    guard let encoded = value as? [AnyObject] else { return nil }
    let elements = decodeAXArrayElements(encoded) {
        try? unwrapAXUIElement($0, throwingOnFailure: false)
    }
    return try? convertedAXArray(elements, as: [AXUIElement].self, throwingOnFailure: false)
}
