import ApplicationServices

extension UIElementTree where Element == TransformedUIElement {
    // Source0x100767008 compares all located items with selection count. A
    // mismatch discards the partial match and rebuilds EVERY selected source,
    // each with empty path/nil parent and its own visited set.
    mutating func focusTree(forSelection selected: [UIElement]?,
        context: inout UIElementTransformationContext,
        reportSelectionResolutionFailure: () -> Void,
        reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
        reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void
    ) -> Self? {
        guard focusedElement != nil else { return nil }
        guard let selected else { return focusTree(selectedItems: []) }
        if let resolved = itemsForFocusSelection(selected.map { $0.axElement }) {
            return focusTreeForResolvedSelection(resolved)
        }
        reportSelectionResolutionFailure()
        var rebuilt = Self(items: [], focusedElement: nil)
        for source in selected {
            rebuilt.add(source, context: &context, reportDepthLimit: reportDepthLimit,
                reportLimit: reportLimit, reportError: reportError,
                reportUnknownDateComponents: reportUnknownDateComponents)
        }
        return focusTree(selectedItems: rebuilt.items)
    }
}

extension UIElementTree where Element == TransformedUIElement {
    // Concrete focus entry0x100766958: no focus means no provider query.
    // Selection comes from the captured focus's UIElement/cache, not a fresh
    // global focused-element lookup or an unrelated application's focus.
    mutating func focusTree(context: inout UIElementTransformationContext,
        reportSelectionResolutionFailure: () -> Void,
        reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
        reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void
    ) -> Self? {
        guard let focusedElement else { return nil }
        let selected = focusedElement.element.selectedElementsForFocus(reportError: reportError)
        return focusTree(forSelection: selected, context: &context,
            reportSelectionResolutionFailure: reportSelectionResolutionFailure,
            reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
            reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents)
    }
}
