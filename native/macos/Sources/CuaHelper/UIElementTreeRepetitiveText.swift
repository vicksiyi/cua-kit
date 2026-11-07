import Foundation

extension UIElementTreeTransformation {
    // Tag 6: 0x100659d8c -> 0x10065ae20, helper 0x10065c5ac.
    static func flattenRepetitiveStaticText<Element: MutableAccessibilityNode>(
        item original: UIElementTree<Element>.Item
    ) -> Result<Element> {
        guard !original.element.isFocusable, !original.element.isSelectable else { return .unchanged }
        var item = original
        guard !item.subtree.hasDescendant(where: \Element.canBeUserInteractive) else { return .unchanged }
        let description = item.element.description
        let value = item.element.stringValue
        return flattenRepeatedChildren(item: &item, description: description, value: value)
            ? .transformed(item) : .unchanged
    }

    private static func flattenRepeatedChildren<Element: MutableAccessibilityNode>(
        item: inout UIElementTree<Element>.Item, description: String?, value: String?
    ) -> Bool {
        func contains(_ parent: String?, _ child: String?) -> Bool {
            guard let child else { return false }
            let trimmed = child.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, let parent else { return false }
            return parent.contains(trimmed)
        }
        // Snapshot the matches before mutation, descending by original index.
        let indices = item.children.indices.reversed().filter { index in
            let element = item.children[index].element
            return contains(description, element.description) || contains(value, element.value)
        }
        guard !indices.isEmpty else { return false }
        for index in indices {
            let children = item.subtree.items[index].children
            item.subtree.items.replaceSubrange(index...index, with: children)
        }
        // Keep the original parent's strings; newly promoted children may also
        // repeat them. The recursive result does not undo this pass's change.
        _ = flattenRepeatedChildren(item: &item, description: description, value: value)
        return true
    }
}
