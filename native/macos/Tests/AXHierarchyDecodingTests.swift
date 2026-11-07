import Foundation
import ApplicationServices

@main struct Test {
    enum Failure: Error { case decode }
    static func main() {
        let root = AXUIElementCreateApplication(12345)
        let child = AXUIElementCreateApplication(12346)
        let keys = AXHierarchyResultKeys(value: "v", count: "n")
        var calls = 0, booleanCalls = 0
        func decode(_ raw: AnyObject?) -> AXHierarchyAttributeTable {
            decodedAXHierarchy(raw, arrayAttributes: ["AXChildren" as CFString], resultKeys: keys,
                incompleteResultKey: "incomplete", decodeBoolean: { raw in
                    booleanCalls += 1
                    if raw is NSString { throw Failure.decode }
                    return raw as? Bool
                }, reread: { element in
                    precondition(CFEqual(element, root)); calls += 1
                    return [root: [:], child: [:]]
                })
        }
        precondition(decode(nil).isEmpty && decode(NSNull()).isEmpty)
        precondition(decode(["invalid": 1] as NSDictionary).isEmpty)
        func hierarchy(_ elements: [AXUIElement: NSDictionary]) -> NSDictionary { elements as NSDictionary }
        let valid = hierarchy([root: ["AXChildren": ["v": [child], "n": 8], "AXTitle": ["v": "hello"]]])
        let result = decode(valid)
        precondition(result[root]?[UIElementAttribute("AXChildren")]?.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 8, availableRanges: [0..<1]))
        precondition(result[root]?[UIElementAttribute("AXTitle")]?.value.value as? String == "hello")
        precondition(calls == 0 && booleanCalls == 0)
        precondition(decode(hierarchy([root: [:]]))[root]?.isEmpty == true)
        let recursive = decode(hierarchy([root: ["incomplete": true, "AXTitle": ["v": "stale"]]]))
        precondition(calls == 1 && recursive.count == 2 && recursive[root]?.isEmpty == true && recursive[child]?.isEmpty == true)
        for marker: Any in [false, NSNull(), "throws"] {
            precondition(decode(hierarchy([root: ["incomplete": marker, "AXTitle": ["v": "discarded"]]])).isEmpty)
        }
        precondition(calls == 1 && booleanCalls == 3)
        // An invalid element record is skipped without discarding valid peers.
        let mixed = hierarchy([root: ["AXTitle": 4], child: ["AXTitle": ["v": "kept"]]])
        precondition(decode(mixed).count == 1 && decode(mixed)[child] != nil)
        print("Hierarchy dictionary bridging, reread and malformed record handling passed")
    }
}
