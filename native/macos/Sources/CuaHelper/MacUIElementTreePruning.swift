extension MacUIElementTreeTransformation {
    // Mac override before common tag 2, 0x100759b98. Non-full contexts
    // discard undescriptive inactive leaves even if they expose actions.
    static func pruneNonDescriptiveSubtrees(
        item: UIElementTree<TransformedUIElement>.Item,
        context: UIElementTransformationContext
    ) -> UIElementTreeTransformation.Result<TransformedUIElement> {
        if context.type != .fullUIContext && item.children.isEmpty &&
            !item.element.hasDescriptiveAttributes && !item.element.isFocused &&
            !item.element.isSelected && !item.element.isDisclosing {
            return .removed
        }
        return UIElementTreeTransformation.pruneNonDescriptiveSubtrees(item: item)
    }

    // Tag 10, 0x1007598c4. Resolve the owning application only after all
    // structural checks. The provider seam represents pid -> running app ->
    // bundleIdentifier; nil at any step leaves the original item unchanged.
    static func removeElementsUnderCalendarEvents(
        item: UIElementTree<TransformedUIElement>.Item,
        owningBundleIdentifier: () -> String?
    ) -> UIElementTreeTransformation.Result<TransformedUIElement> {
        guard item.element.role == .staticText,
            item.element.roleDescription == "Event",
            item.children.count == 1,
            item.children[0].element.role == .staticText,
            owningBundleIdentifier() == "com.apple.iCal" else { return .unchanged }
        var result = item
        result.subtree.items = []
        return .transformed(result)
    }
}
