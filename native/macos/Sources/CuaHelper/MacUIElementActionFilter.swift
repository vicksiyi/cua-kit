// Predicate 0x1007946b0. Getter closures preserve native short-circuiting;
// scroll-bar reads must use value<UIElement>(ignoringTypeMismatch: false).
func macUIElementKeepsAction(
    _ action: UIElementAction,
    isCatalyst: Bool,
    role: () -> UIElementRole,
    isValueSettable: () -> Bool,
    readElement: (UIElementAttribute) -> UIElement?
) -> Bool {
    if action == .showAlternateUI || action == .showDefaultUI { return false }
    if action == .cancel {
        if isCatalyst || role() == UIElementRole("AXMenuBar") { return false }
        return role() != .menuItem
    }
    if action == .pick { return role() != .menuItem }
    if action == .scrollLeftByPage || action == .scrollRightByPage {
        return readElement(UIElementAttribute("AXHorizontalScrollBar")) != nil
    }
    if action == .scrollUpByPage || action == .scrollDownByPage {
        return readElement(UIElementAttribute("AXVerticalScrollBar")) != nil
    }
    if action == .confirm { return role() != .textField }
    if action == .increment || action == .decrement { return !isValueSettable() }
    return true
}

extension MacUIElementTreeTransformation {
    // Tag 9 at 0x1007597d0. Other context types bypass filtering entirely.
    // The original captures the transformed node before replacing its actions.
    // readElement is the typed provider seam, not a raw AX presence check.
    static func filterActions(
        item: UIElementTree<TransformedUIElement>.Item,
        context: UIElementTransformationContext,
        readElement: (UIElementAttribute) -> UIElement?
    ) -> UIElementTreeTransformation.Result<TransformedUIElement> {
        guard context.type == .fullUIContext else { return .unchanged }
        let captured = item.element
        var result = item
        result.element.actionDescriptions = captured.actionDescriptions.filter {
            macUIElementKeepsAction($0.action, isCatalyst: context.isCatalyst,
                role: { captured.role }, isValueSettable: { captured.isValueSettable },
                readElement: readElement)
        }
        return .transformed(result)
    }
}
