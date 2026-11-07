extension UIElementTreeTransformation {
    // Extracted tag-3 branch at 0x10065a528. No rendering/context side effects.
    static func pruneEmptyDisabledElements<Element: MutableAccessibilityNode>(
        item: UIElementTree<Element>.Item
    ) -> Result<Element> {
        if item.element.isEnabled || item.element.isFocused || !item.children.isEmpty ||
            item.hasDescriptiveAttributes { return .unchanged }
        return .removed
    }

    // Extracted tag-2 branch at 0x100659ab4. Descendant queries use the same
    // cached tree predicates as the native branch, in the same order.
    static func pruneNonDescriptiveSubtrees<Element: MutableAccessibilityNode>(
        item: UIElementTree<Element>.Item
    ) -> Result<Element> {
        if item.element.isFocusableOrSelectable || item.element.hasInterestingActions ||
            item.hasDescriptiveAttributes { return .unchanged }
        var subtree = item.subtree
        if subtree.hasDescendant(where: \Element.isFocusableOrSelectable) ||
            subtree.hasDescendant(where: \Element.hasInterestingActions) { return .unchanged }
        return .removed
    }
}
