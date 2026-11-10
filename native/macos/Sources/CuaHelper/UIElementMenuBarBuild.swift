import ApplicationServices

extension UIElementTree where Element == TransformedUIElement {
    // Source0x100767f88 captures retained immediate children as leaves first,
    // then reconstructs/captures the menu bar and appends it. The typed items
    // getter is still explicit; do not substitute a recursive children walk.
    mutating func addMenuBarWithImmediateItems(_ menuBar: any UIElementProtocol,
        items: [MenuBarItemUIElement], context: inout UIElementTransformationContext,
        reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void
    ) {
        var subtree = Self(items: [], focusedElement: nil)
        forEachImmediateMenuBarItem(items, title: { $0.cachedStringValue(for: UIElementAttribute("AXTitle")) }) { item in
            let provider = UIElement(element: item.axElement)
            let captured = TransformedUIElement(element: provider, context: context,
                traversalParentRole: nil, reportError: reportError,
                reportUnknownDateComponents: reportUnknownDateComponents)
            subtree.appendBuiltElement(captured, subtree: Self(items: [], focusedElement: nil), availableSubset: nil)
        }
        let provider = UIElement(element: menuBar.axElement)
        let captured = TransformedUIElement(element: provider, context: context,
            traversalParentRole: nil, reportError: reportError,
            reportUnknownDateComponents: reportUnknownDateComponents)
        appendBuiltElement(captured, subtree: subtree, availableSubset: nil)
    }
}

extension UIElementTree where Element == TransformedUIElement {
    mutating func addMenuBarWithImmediateItems(_ menuBar: MenuBarUIElement,
        context: inout UIElementTransformationContext, reportError: (Error) -> Void,
        reportUnknownDateComponents: (UInt) -> Void) {
        addMenuBarWithImmediateItems(menuBar, items: menuBar.itemsValue(reportError: reportError),
            context: &context, reportError: reportError,
            reportUnknownDateComponents: reportUnknownDateComponents)
    }
}
