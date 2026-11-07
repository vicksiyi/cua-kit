import Foundation
import ApplicationServices

/// Transaction role census at 0x10076cf10..<0x10076d2b4. Counts only prefetched
/// AXRole values; never performs a cold read or substitutes AXUnknown.
func accumulateUIElementRoleFrequencies(
    _ table: [AXUIElement: [UIElementAttribute: AXPartialValue]],
    into counts: inout FrequencyTable<UIElementRole>,
    decodeString: (AnyObject) throws -> String?
) {
    for attributes in table.values {
        guard let value = attributes[UIElementAttribute("AXRole")],
              let name = try? decodeString(value.value.value) else { continue }
        let role = UIElementRole(name)
        counts.increment(role)
    }
}

func uiElementRoleFrequencies(
    _ table: [AXUIElement: [UIElementAttribute: AXPartialValue]]
) -> FrequencyTable<UIElementRole> {
    var counts = FrequencyTable<UIElementRole>()
    accumulateUIElementRoleFrequencies(table, into: &counts,
        decodeString: { try decodeAXString($0, throwingOnFailure: false) })
    return counts
}
