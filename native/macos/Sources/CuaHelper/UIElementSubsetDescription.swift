// UIElementTree.Item.availableSubsetDescription, 0x10064ea74..0x10064ecc4.
// Extracted until the complete generic tree owner is reconstructed. Bounds are
// rendered verbatim (including half-open upperBound), in stored range order.
func uiElementAvailableSubsetDescription(_ subset: AXArraySubsetDescriptor?) -> String? {
    guard let subset, let ranges = subset.availableRanges else { return nil }
    let description = ranges.map { "\($0.lowerBound)-\($0.upperBound)" }.joined(separator: ", ")
    return "(showing \(description) of \(subset.count) items)"
}
