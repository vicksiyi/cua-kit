import Foundation
import ApplicationServices

@main
struct AXStoredValueTests {
    static func main() {
        for object: AnyObject in ["" as NSString, "AX文本" as NSString, NSMutableString(string: "mutable")] {
            let encoded = AXEncodedValue(value: object)
            precondition(encoded.value === object && encoded.valueIsString)
        }
        var point = CGPoint(x: 1.5, y: -2)
        let axValue = AXValueCreate(.cgPoint, &point)!
        for object: AnyObject in [NSNumber(value: 4), NSNumber(value: true), ["text"] as NSArray,
                                 NSAttributedString(string: "text"), axValue, AXUIElementCreateSystemWide()] {
            precondition(!AXEncodedValue(value: object).valueIsString)
        }
        // Partial array metadata survives the existing decoder composition;
        // its count/ranges do not rewrite the actual decoded array.
        let raw = ["one", "one"] as NSArray
        var subset = AXArraySubsetDescriptor(count: 20, availableRanges: [])
        var truncation = AXTruncationDescriptor(count: 100, availableRange: 2..<5)
        let partial = AXPartialValue(value: AXEncodedValue(value: raw),
            arraySubsetDescriptor: subset, textTruncationDescriptor: truncation)
        subset.count = 1
        truncation.count = 1
        let decoded: (array: [String], subsetDescriptor: AXArraySubsetDescriptor?)? = decodedAXPartialArray(
            subsetDescriptor: partial.arraySubsetDescriptor,
            decode: { partial.value.value as? [String] })
        precondition(decoded?.array == ["one", "one"])
        precondition(decoded?.subsetDescriptor?.count == 20)
        precondition(decoded?.subsetDescriptor?.availableRanges == [])
        precondition(partial.textTruncationDescriptor?.count == 100)
        precondition(partial.textTruncationDescriptor?.availableRange == 2..<5)
        precondition(partial.value.value === raw)
        let none = AXPartialValue(value: partial.value, arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        precondition(none.arraySubsetDescriptor == nil && none.textTruncationDescriptor == nil)
        print("native stored AX values preserve CF type checks, identity and partial descriptors")
    }
}
