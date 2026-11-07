import Foundation
import ApplicationServices

@main struct Test {
    static func main() {
        let root = AXUIElementCreateApplication(12345)
        let child = AXUIElementCreateApplication(12346)
        let arrays = [UIElementAttribute("AXChildren"), UIElementAttribute("AXChildren")]
        let requested = [UIElementAttribute("AXTitle"), UIElementAttribute("AXChildren")]
        var calls = 0, dispatches = 0, insideMain = false
        var trace: [String] = []
        let reader = AXHierarchyReader(resolvePID: { element in
            trace.append("pid"); return CFEqual(element, root) ? 7 : 8
        }, currentPID: { trace.append("own"); return 7 },
        isMainThread: { false }, onMain: { body in
            dispatches += 1; insideMain = true
            defer { insideMain = false }
            return body()
        }, optionKeys: {
            precondition(insideMain == (calls == 0))
            return AXHierarchyOptionKeys(skipInspectionForAttributes: "skip" as CFString,
                arrayAttributes: "arrays" as CFString, truncateStrings: "truncate" as CFString,
                maxArrayCount: "max" as CFString)
        }, resultKeys: { AXHierarchyResultKeys(value: "v", count: "n") },
        incompleteResultKey: { "incomplete" }, decodeBoolean: { $0 as? Bool },
        copy: { element, attributes, options, output in
            calls += 1
            precondition((attributes as NSArray) as? [String] == ["AXTitle", "AXChildren"])
            let options = options as NSDictionary
            precondition(options["skip"] as? [String] == ["AXTitle", "AXChildren"])
            precondition(options["arrays"] as? [String] == ["AXChildren", "AXChildren"])
            precondition(options["max"] as? Int == -5 && options["truncate"] as? Bool == true)
            let records: [AXUIElement: NSDictionary]
            if calls == 1 {
                precondition(CFEqual(element, root))
                records = [child: ["incomplete": true]]
            } else {
                precondition(calls == 2 && CFEqual(element, child))
                records = [child: ["AXTitle": ["v": "done"], "AXChildren": ["v": [], "n": 4]]]
            }
            output = .passRetained((records as NSDictionary) as CFDictionary)
            return .failure // Data remains usable despite the status.
        })
        let result = reader.read(root, arrayAttributes: arrays, requestedAttributes: requested, maxChildCount: -5)
        precondition(calls == 2 && dispatches == 1 && trace == ["own", "pid", "own", "pid"])
        precondition(result.count == 1 && result[child]?[UIElementAttribute("AXTitle")]?.value.value as? String == "done")
        precondition(result[child]?[UIElementAttribute("AXChildren")]?.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 4, availableRanges: [0..<0]))
        print("Hierarchy reader preserves recursive configuration and native call composition")
    }
}
