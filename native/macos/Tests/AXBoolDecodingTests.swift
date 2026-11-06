import ApplicationServices
import Foundation

@main
struct AXBoolDecodingTests {
    static func main() throws {
        // Foundation's conditional bridging is the original conversion, not
        // NSNumber.boolValue or a custom truthiness/string parser.
        for raw in [NSNumber(value: false), NSNumber(value: true), NSNumber(value: 0), NSNumber(value: 1), NSNumber(value: 2), NSNumber(value: -1), NSNumber(value: 0.5), "true" as NSString, "false" as NSString, NSNull(), NSDictionary()] as [AnyObject] {
            let expected = raw as? Bool
            let actual = try decodeAXBool(raw, throwingOnFailure: false)
            precondition(actual == expected)
            do {
                let strict = try decodeAXBool(raw, throwingOnFailure: true)
                precondition(expected != nil && strict == expected)
            } catch UIElementError.failedToUnwrapAttributeValue(let type) {
                precondition(expected == nil && type == Bool.self)
            }
        }
        for raw in [NSArray(), NSArray(array: [true])] {
            let lenient = try decodeAXBool(raw, throwingOnFailure: false)
            precondition(lenient == nil)
            do {
                _ = try decodeAXBool(raw, throwingOnFailure: true)
                preconditionFailure("Array must not become Bool")
            } catch UIElementError.unexpectedAttributeValueType(let expected, let actual) {
                precondition(expected == [Any].self && actual == Bool.self)
            }
        }
        let element = AXUIElementCreateApplication(424242)
        var bytes: [UInt8] = [1,2,3]
        let marker = bytes.withUnsafeMutableBufferPointer { AXTextMarkerCreate(nil,$0.baseAddress!,$0.count) }
        let range = AXTextMarkerRangeCreate(nil,marker,marker)
        for raw in [element,marker,range] as [AnyObject] {
            let lenient = try decodeAXBool(raw, throwingOnFailure:false)
            precondition(lenient == nil)
            do { _ = try decodeAXBool(raw,throwingOnFailure:true); preconditionFailure("Expected mismatch") }
            catch UIElementError.failedToUnwrapAttributeValue(let type) { precondition(type == Bool.self) }
        }
        for error in [AXError.noValue,.success,.cannotComplete,.attributeUnsupported] {
            var e = error
            let raw = AXValueCreate(.axError,&e)!
            let lenient = try decodeAXBool(raw,throwingOnFailure:false)
            precondition(lenient == nil)
            do {
                let result = try decodeAXBool(raw,throwingOnFailure:true)
                precondition(error == .noValue && result == nil)
            } catch UIElementError.axError(let actual) { precondition(error != .noValue && actual == error) }
        }
        print("native Bool decoder preserves strict errors and Foundation conversion")
    }
}
