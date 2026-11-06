import Foundation
import ApplicationServices

// AXChildren integration of the recovered compactMap and AXUIElement type-ID
// checks. The NSArray bridge is a concrete adapter, not a reconstruction of the
// original generic AXEncodedValue / TypeErasedArray dispatch.
func unwrapAXUIElementArray(_ value: AnyObject) -> [AXUIElement]? {
    guard CFGetTypeID(value) == CFArrayGetTypeID() else { return nil }
    let encoded = value as! NSArray
    let elements = decodeAXArrayElements(encoded.map { $0 as AnyObject }) {
        try? unwrapAXUIElement($0, throwingOnFailure: false)
    }
    return try? convertedAXArray(elements, as: [AXUIElement].self, throwingOnFailure: false)
}
