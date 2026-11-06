import Foundation
import ApplicationServices

@main
struct AXOrdinaryValueDecodingTests {
    static func main() throws {
        let string = "中文 🌍\n" as NSString
        let text = try decodeAXOrdinaryValue(string, throwingOnFailure: true, as: String.self)
        precondition(text == "中文 🌍\n")
        let empty = try decodeAXOrdinaryValue("" as NSString, throwingOnFailure: true, as: String.self)
        precondition(empty == "")
        let number = NSNumber(value: 12.5)
        let numberRef = try decodeAXOrdinaryValue(number, throwingOnFailure: true, as: NSNumber.self)
        precondition(numberRef === number)
        let double = try decodeAXOrdinaryValue(number, throwingOnFailure: true, as: Double.self)
        precondition(double == 12.5)
        let boolean = try decodeAXOrdinaryValue(NSNumber(value: false), throwingOnFailure: true, as: Bool.self)
        precondition(boolean == false)
        let optional = try decodeAXOrdinaryValue(string, throwingOnFailure: true, as: Optional<String>.self)
        precondition(optional != nil && optional! == "中文 🌍\n")
        let opaque = try decodeAXOrdinaryValue(string, throwingOnFailure: true, as: AnyObject.self)
        precondition(opaque === string)
        precondition(decodedAXScalarAttribute(string) as? String == "中文 🌍\n")
        precondition(decodedAXScalarAttribute(number) as? NSNumber === number)
        precondition((decodedAXScalarAttribute(kCFBooleanFalse) as? NSNumber)?.boolValue == false)
        precondition(decodedAXScalarAttribute([1, 2] as NSArray) == nil)
        precondition(decodedAXScalarAttribute(AXUIElementCreateApplication(getpid())) == nil)
        var point = CGPoint(x: 1, y: 2)
        precondition(decodedAXScalarAttribute(AXValueCreate(.cgPoint, &point)!) == nil)
        for flag in [false, true] {
            do {
                let result = try decodeAXOrdinaryValue(number, throwingOnFailure: flag, as: String.self)
                precondition(!flag && result == nil)
            } catch UIElementError.failedToUnwrapAttributeValue(let requested) {
                precondition(flag && requested == String.self)
            } catch { preconditionFailure("Wrong decoding error: \(error)") }
        }
        print("native ordinary object decoding preserves bridging, empty values and failure policy")
    }
}
