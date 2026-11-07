import Foundation

@main struct Test {
    static func main() {
        let keys = AXHierarchyResultKeys(value: "value", count: "count")
        func decode(_ name: String, _ record: [String: Any], requested: [CFString] = [],
                    siblings: [String: [String: Any]] = [:]) -> AXPartialValue {
            hierarchyAXPartialValue(name: name, record: record, requestedAttributes: requested,
                                    elementRecords: siblings, keys: keys)
        }
        let array = NSMutableArray(array: ["a", "b"])
        let subset = decode("AXChildren", ["value": array, "count": 5], requested: ["AXChildren" as CFString])
        precondition(subset.value.value === array)
        precondition(subset.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 5, availableRanges: [0..<2]))
        for count: Any in [2, 1, -1, "5", NSNull()] {
            let result = decode("AXChildren", ["value": array, "count": count], requested: ["AXChildren" as CFString])
            precondition(result.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 2))
        }
        precondition(decode("AXChildren", ["value": array, "count": 5]).arraySubsetDescriptor == AXArraySubsetDescriptor(count: 2))
        let empty = decode("AXChildren", ["value": [] as NSArray, "count": 3], requested: ["AXChildren" as CFString])
        precondition(empty.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 3, availableRanges: [0..<0]))
        precondition(decode("AXChildren", [:]).value.value is NSNull)
        precondition(decode("AXChildren", ["value": NSNull()]).arraySubsetDescriptor == nil)
        let text = "😀e\u{301}" as NSString
        let siblings: [String: [String: Any]] = ["AXNumberOfCharacters": ["value": 20]]
        let result = decode("AXValue", ["value": text, "count": 999], siblings: siblings)
        precondition(result.textTruncationDescriptor == AXTruncationDescriptor(count: 20, availableRange: 0..<4))
        precondition(result.arraySubsetDescriptor == nil && result.value.value === text)
        precondition(decode("AXTitle", ["value": text], siblings: siblings).textTruncationDescriptor == nil)
        precondition(decode("AXValue", ["value": text], siblings: ["AXNumberOfCharacters": ["value": "20"]]).textTruncationDescriptor == nil)
        // Native does not clamp contradictory totals or require truncation.
        precondition(decode("AXValue", ["value": text], siblings: ["AXNumberOfCharacters": ["value": -1]]).textTruncationDescriptor == AXTruncationDescriptor(count: -1, availableRange: 0..<4))
        print("Hierarchy partial values preserve subset and UTF16 truncation metadata")
    }
}
