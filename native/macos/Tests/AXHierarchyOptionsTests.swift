import Foundation
import ApplicationServices

@main struct AXHierarchyOptionsTests {
    static func main() {
        let keys = AXHierarchyOptionKeys(skipInspectionForAttributes: "fixture.skip" as CFString,
            arrayAttributes: "fixture.arrays" as CFString, truncateStrings: "fixture.truncate" as CFString,
            maxArrayCount: "fixture.count" as CFString)
        let requested = ["AXRole", "AXTitle", "AXTitle"].map(UIElementAttribute.init)
        let arrays = ["AXChildren", "AXRows"].map(UIElementAttribute.init)
        for maximum in [Int.min, -1, 0, 1, 500, Int.max] {
            for empty in [false, true] {
                let options = axHierarchyOptions(requestedAttributes: empty ? [] : requested,
                    arrayAttributes: empty ? [] : arrays, maxChildCount: maximum, keys: keys) as NSDictionary
                precondition(options.count == 4)
                precondition(options["fixture.skip"] as? [String] == (empty ? [] : ["AXRole", "AXTitle", "AXTitle"]))
                precondition(options["fixture.arrays"] as? [String] == (empty ? [] : ["AXChildren", "AXRows"]))
                let truncate = options["fixture.truncate"] as! NSNumber
                precondition(CFGetTypeID(truncate) == CFBooleanGetTypeID() && truncate.boolValue)
                let count = options["fixture.count"] as! NSNumber
                precondition(CFGetTypeID(count) != CFBooleanGetTypeID() && count.intValue == maximum)
            }
        }
        print("native hierarchy options preserve SPI keys, attribute arrays and count")
    }
}
