extension UIElementTree {
    // 0x100650a38..0x100650d50. Selection is already supplied by the caller;
    // this method neither discovers selection nor prunes the original tree.
    func focusTree(selectedItems: [Item]) -> UIElementTree<Element>? {
        guard let focusedElement else { return nil }
        let subtree = UIElementTree(items: selectedItems, focusedElement: nil)
        let root = Item(element: focusedElement, subtree: subtree, availableSubset: nil)
        return UIElementTree(items: [root], focusedElement: focusedElement)
    }

    // 0x10064ecc4..0x10064f1cc: exactly one root and equal optional identities.
    // No subtree-size, selected-state or whole-element equality requirement.
    func isFocusTree() -> Bool {
        guard items.count == 1 else { return false }
        return Optional(items[0].element.id) == focusedElement.map(\.id)
    }
}
