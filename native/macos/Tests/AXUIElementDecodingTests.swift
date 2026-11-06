import ApplicationServices

@main
struct AXUIElementDecodingTests {
    static func main() throws {
        // Creating references does not read another app's UI or require AX trust.
        let elements = [AXUIElementCreateSystemWide(), AXUIElementCreateApplication(getpid())]
        for element in elements {
            for strict in [false, true] {
                let result = try unwrapAXUIElement(element, throwingOnFailure: strict)
                precondition(result === element)
            }
        }
        var point = CGPoint(x: 2, y: 5)
        let axValue = AXValueCreate(.cgPoint, &point)!
        let invalid: [AnyObject] = ["AXUIElement" as NSString, NSNumber(value: 1), NSArray(), NSDictionary(), axValue]
        for value in invalid {
            let result = try unwrapAXUIElement(value, throwingOnFailure: false)
            precondition(result == nil)
            do {
                _ = try unwrapAXUIElement(value, throwingOnFailure: true)
                preconditionFailure("Expected typed unwrap failure")
            } catch UIElementError.failedToUnwrapAttributeValue(let type) {
                precondition(type == AXUIElement.self)
            }
        }
        print("14 native AXUIElement decoding cases passed")
    }
}
