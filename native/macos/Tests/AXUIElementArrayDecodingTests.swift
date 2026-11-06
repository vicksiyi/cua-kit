import Foundation
import ApplicationServices

@main
struct AXUIElementArrayDecodingTests {
    static func main() {
        // Construct references only: this does not read or control application UI.
        let first = AXUIElementCreateSystemWide()
        let second = AXUIElementCreateApplication(getpid())
        var point = CGPoint(x: 1, y: 2)
        let axValue = AXValueCreate(.cgPoint, &point)!
        let invalid: [AnyObject] = ["not an element" as NSString, NSNumber(value: 3),
                                    NSDictionary(), NSArray(), axValue]
        for value in invalid where CFGetTypeID(value) != CFArrayGetTypeID() {
            precondition(unwrapAXUIElementArray(value) == nil)
        }
        precondition(unwrapAXUIElementArray(first) == nil)
        precondition(unwrapAXUIElementArray(NSArray())!.isEmpty)
        precondition(unwrapAXUIElementArray(invalid as NSArray)!.isEmpty)
        let mixed = ([first] + invalid + [second, first]) as NSArray
        let children = unwrapAXUIElementArray(mixed)!
        precondition(children.count == 3)
        precondition(children[0] === first && children[1] === second && children[2] === first)
        // A nested array is not flattened into the children list.
        let nested = NSArray(objects: NSArray(object: first), second)
        let decoded = unwrapAXUIElementArray(nested)!
        precondition(decoded.count == 1 && decoded[0] === second)
        print("native AX children decode rejects non-arrays and skips invalid elements with identity/order preserved")
    }
}
