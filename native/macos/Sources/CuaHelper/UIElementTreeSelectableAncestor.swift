extension UIElementTreeTransformation {
    // Tag 1, 0x100659e58..0x10065a524, shared rebuild loop at 0x10065af6c.
    static func flattenIntoSelectableAncestor<Element: MutableAccessibilityNode, Context: AccessibilityRenderingContext>(
        item original: UIElementTree<Element>.Item, context: inout Context,
        rebuild: ((inout UIElementTree<Element>, UIElementTree<Element>.Item, inout Context) -> Void)? = nil
    ) -> Result<Element> where Element.Role == Context.Role {
        var item = original
        guard item.element.isSelectable, !item.element.isFocused,
              item.element.role != .table, !item.element.isTableRow,
              !item.subtree.hasDescendant(where: \.isValueSettable),
              !item.subtree.hasDescendant(where: \.isSelectable) else { return .unchanged }
        // Capture all three strings before writing any mutable node field.
        // stringValue deliberately excludes Boolean-valued controls.
        let description = item.flattenedString { $0.description }
        let value = item.flattenedString { $0.stringValue }
        let title = item.flattenedString { $0.title }
        item.element.isFocusable = item.subtree.hasDescendant(where: \.isFocusable)
        item.element.value = value
        item.element.description = description
        item.element.title = title
        // Native depthFirstTraversal.filter(boolValue != nil).map(\.item).
        // Preserve entire captured items, even nested Boolean controls; there
        // is no additional leaf, role, subset or duplicate-identity filter.
        var retained: [UIElementTree<Element>.Item] = []
        func collect(_ tree: UIElementTree<Element>) {
            for child in tree.items {
                if child.element.boolValue != nil { retained.append(child) }
                collect(child.subtree)
            }
        }
        collect(item.subtree)
        item.subtree.items.removeAll(keepingCapacity: false)
        for child in retained {
            if let rebuild { rebuild(&item.subtree, child, &context) }
            else { item.subtree.items.append(child) }
        }
        return .transformed(item)
    }
}
