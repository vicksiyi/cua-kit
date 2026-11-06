import ApplicationServices

extension UIElement {
    // Concrete cache/parent/frame composition of 0x10079eb20. External system
    // boundaries remain injectable; they are evaluated lazily in source order.
    func chessPreferredPoint(
        transaction: UIElementTransactionCache?,
        bundleIdentifier: () -> String?,
        resolveApp: (String) -> UIElement?,
        hitTest: (UIElement, CGPoint) throws -> UIElement?,
        matches: (UIElement, UIElement) -> Bool,
        read: (AXUIElement, UIElementAttribute) -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> CGPoint? {
        uiElementChessClickPoint(role: { role }, title: { title },
            bundleIdentifier: bundleIdentifier, resolveApp: resolveApp,
            elementFrame: { frameValue(readAttribute: { read(axElement, $0) }, reportError: reportError) },
            hitTest: hitTest, matchesTarget: { matches($0, self) },
            parentFrame: {
                guard let parent = parentValue(transaction: transaction,
                    read: { read(axElement, UIElementAttribute(kAXParentAttribute)) }, reportError: reportError) else { return nil }
                return parent.frameValue(readAttribute: { read(parent.axElement, $0) }, reportError: reportError)
            })
    }
}
