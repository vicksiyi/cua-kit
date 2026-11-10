// Native builder finalization 0x10076881c constructs one Item and appends
// through items.setter (0x10076892c -> 0x10064fb6c). Preserve subtree focus
// and subset metadata; the destination tree keeps its own focused snapshot.
extension UIElementTree {
    mutating func appendBuiltElement(_ element: Element, subtree: Self,
        availableSubset: AXArraySubsetDescriptor?) {
        items.append(Item(element: element, subtree: subtree,
            availableSubset: availableSubset))
    }
}
