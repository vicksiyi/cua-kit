import ApplicationServices
import Foundation

@main
struct AXStringDecodingTests {
    static func main() throws {
        for text in ["", "AXDialog", "中文🖱️", "a\u{0}b"] {
            for strict in [false, true] {
                let decoded = try decodeAXString(text as NSString, throwingOnFailure: strict)
                precondition(decoded == text)
            }
        }
        let element = AXUIElementCreateApplication(424242)
        var bytes: [UInt8] = [1, 2, 3]
        let marker = bytes.withUnsafeMutableBufferPointer { AXTextMarkerCreate(nil, $0.baseAddress!, $0.count) }
        let range = AXTextMarkerRangeCreate(nil, marker, marker)
        let rejected: [AnyObject] = [element, marker, range, NSNumber(value: 42), NSNull(), NSDictionary()]
        for raw in rejected {
            let decoded = try decodeAXString(raw, throwingOnFailure: false)
            precondition(decoded == nil)
            do {
                _ = try decodeAXString(raw, throwingOnFailure: true)
                preconditionFailure("Expected String mismatch")
            } catch UIElementError.failedToUnwrapAttributeValue(let type) {
                precondition(type == String.self)
            }
        }
        for raw in [NSArray(), NSArray(array: ["AXDialog"])] {
            let decoded = try decodeAXString(raw, throwingOnFailure: false)
            precondition(decoded == nil)
            do {
                _ = try decodeAXString(raw, throwingOnFailure: true)
                preconditionFailure("Array must not become String")
            } catch UIElementError.unexpectedAttributeValueType(let expected, let actual) {
                precondition(expected == [Any].self && actual == String.self)
            }
        }
        for error in [AXError.noValue, .success, .cannotComplete, .attributeUnsupported] {
            var source = error
            let raw = AXValueCreate(.axError, &source)!
            let decoded = try decodeAXString(raw, throwingOnFailure: false)
            precondition(decoded == nil)
            do {
                let result = try decodeAXString(raw, throwingOnFailure: true)
                precondition(error == .noValue && result == nil)
            } catch UIElementError.axError(let actual) {
                precondition(error != .noValue && actual == error)
            }
        }
        var point = CGPoint(x: 3, y: 4)
        let rawPoint = AXValueCreate(.cgPoint, &point)!
        do {
            _ = try decodeAXString(rawPoint, throwingOnFailure: true)
            preconditionFailure("Point must not stringify")
        } catch UIElementError.failedToUnwrapAttributeValue(let type) {
            precondition(type == String.self)
        }
        let key = UIElementAttribute(kAXSubroleAttribute)
        for raw in ["AXDialog" as NSString, NSNull()] as [AnyObject] {
            let partial = AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
            let item = UIElement(axElement: element, cache: UIElementCache(supportedAttributes: [], attributes: [key: partial], transactionAttributes: []))
            precondition(item.subrole == (raw as? String))
        }
        let missing = UIElement(axElement: element, cache: UIElementCache(supportedAttributes: [key], attributes: [:], transactionAttributes: nil))
        precondition(missing.subrole == nil)
        print("native String decoding preserves CF dispatch, strict errors, Unicode and cached subrole")
    }
}
