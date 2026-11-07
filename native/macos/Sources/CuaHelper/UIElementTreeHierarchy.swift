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


extension UIElementTreeTransformation {
    // Tag 5, 0x10065a630 -> 0x10065ba78. Render errors retain the relevant
    // node; context mutations performed before a throw are not rolled back.
    static func flattenRedundantHierarchy<Element: MutableAccessibilityNode, Context: AccessibilityRenderingContext>(
        item original: UIElementTree<Element>.Item, context: inout Context,
        render: (Element, inout Context) throws -> String
    ) -> Result<Element> where Element.Role == Context.Role {
        guard !original.element.isSelectable, !original.element.isFocused,
              !original.element.hasDescriptiveAttributes else { return .unchanged }
        let parentText: String
        do { parentText = try render(original.element, &context) }
        catch { return .unchanged }
        var item = original
        // Reverse the ORIGINAL child indices; inserted grandchildren are not
        // inspected again during this pass. The tree driver processes them later.
        for index in original.children.indices.reversed() {
            let child = item.subtree.items[index]
            guard item.element.role == child.element.role,
                  child.availableSubset?.availableRanges == nil else { continue }
            let childText: String
            do { childText = try render(child.element, &context) }
            catch { continue }
            guard parentText == childText else { continue }
            item.subtree.items.replaceSubrange(index...index, with: child.children)
        }
        // Original returns transformed even if no child matched (or none exist).
        return .transformed(item)
    }
}
