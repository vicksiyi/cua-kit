import Foundation
import ApplicationServices

// Focus preparation may intentionally change AXFocused. All other observed
// fields still participate in the existing stale-observation comparison.
func inputSnapshotDataEqual(_ previous: [String: Any], _ current: [String: Any], allowingFocusChange: Bool) -> Bool {
    func normalized(_ value: [String: Any]) -> [String: Any] {
        guard allowingFocusChange, var properties = value["properties"] as? [String: Any] else { return value }
        var result = value
        properties.removeValue(forKey: kAXFocusedAttribute)
        result["properties"] = properties
        return result
    }
    return NSDictionary(dictionary: normalized(previous)).isEqual(to: normalized(current))
}
