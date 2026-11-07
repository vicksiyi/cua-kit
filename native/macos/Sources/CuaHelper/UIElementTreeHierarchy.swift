extension UIElementTreeTransformation {
    // Tag 4: 0x100659c10, 0x10065be7c and 0x10065bf5c. This tests the
    // node description (not flattened item text) and the CHILD subset.
    static func mergeSingleItemGroups<Element: MutableAccessibilityNode>(
        item: UIElementTree<Element>.Item
    ) -> Result<Element> {
        guard item.element.role.isGrouping,
              !item.element.isSelectable,
              !item.element.isFocused,
              !item.element.hasDescriptiveAttributes else { return .unchanged }
        if item.children.count == 1, let child = item.children.first,
           child.availableSubset?.availableRanges == nil {
            return .replaced(child)
        }
        return item.children.isEmpty ? .removed : .unchanged
    }
}
