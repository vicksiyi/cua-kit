import Foundation
import ApplicationServices

@main
struct AXTypedAttributeDecodingTests {
    static func box<Value>(_ type: AXValueType, _ value: Value) -> AXValue {
        var value = value
        return withUnsafePointer(to: &value) { AXValueCreate(type, $0)! }
    }
    static func main() {
        let point = CGPoint(x: -40, y: 8), size = CGSize(width: 120, height: 30)
        let pointValue = box(.cgPoint, point), sizeValue = box(.cgSize, size)
        precondition(decodedAXTypedAttribute(pointValue, as: CGPoint.self) == point)
        precondition(decodedAXTypedAttribute(sizeValue, as: CGSize.self) == size)
        precondition(decodedAXTypedAttribute(pointValue, as: CGSize.self) == nil)
        precondition(decodedAXTypedAttribute(sizeValue, as: CGPoint.self) == nil)
        let range = decodedAXTypedAttribute(box(.cfRange, CFRange(location: 3, length: 2)), as: CFRange.self)!
        precondition(range.location == 3 && range.length == 2)
        precondition(decodedAXTypedAttribute(pointValue, as: CFRange.self) == nil)
        // Keep decoding distinct from the consumer's range/geometry validation.
        let invalidRange = decodedAXTypedAttribute(box(.cfRange, CFRange(location: -1, length: 0)), as: CFRange.self)!
        precondition(invalidRange.location == -1)
        for error in [AXError.noValue, .cannotComplete, .success] {
            let encoded = box(.axError, error)
            precondition(decodedAXTypedAttribute(encoded, as: CGPoint.self) == nil)
            precondition(decodedAXTypedAttribute(encoded, as: CFRange.self) == nil)
            precondition(decodedAXTypedAttribute(encoded, as: AXError.self) == error)
        }
        for raw: AnyObject in [NSString(string:"point"), NSNumber(value: 3), NSArray(), NSDictionary(), AXUIElementCreateSystemWide()] {
            precondition(decodedAXTypedAttribute(raw, as: CGPoint.self) == nil)
            precondition(decodedAXTypedAttribute(raw, as: CFRange.self) == nil)
        }
        print("native typed attribute adapter preserves geometry/ranges and rejects wrong CF/value types")
    }
}
