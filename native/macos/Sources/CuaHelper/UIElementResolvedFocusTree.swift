extension UIElementTree where Element == TransformedUIElement {
    // Source0x100767024..0x1007671bc projects each successfully resolved
    // selection to a leaf before focusTree(selectedItems:). Existing descendants
    // and subset metadata must not leak into this focused selection snapshot.
    func focusTreeForResolvedSelection(_ selected: [Item]) -> Self? {
        let leaves = selected.map { item in
            Item(element: item.element, subtree: Self(items: [], focusedElement: nil), availableSubset: nil)
        }
        return focusTree(selectedItems: leaves)
    }
}
