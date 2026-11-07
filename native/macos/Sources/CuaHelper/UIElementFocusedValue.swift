import ApplicationServices

extension UIElement {
    // ApplicationUIElement.focusedUIElement (0x100715d4c) reads the same
    // AX element value pipeline as parent, with AXFocusedUIElement and exact
    // type checking. Preserve cache/transaction construction through reuse.
    func focusedUIElementValue(
        transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> UIElement? {
        elementValue(for: UIElementAttribute("AXFocusedUIElement"),
            transaction: transaction, read: read, reportError: reportError)
    }
}

extension UIElement {
    func focusedUIElementValue(transaction: UIElementTransactionCache?,
                               reportError: (Error) -> Void) -> UIElement? {
        let attribute = UIElementAttribute("AXFocusedUIElement")
        return focusedUIElementValue(transaction: transaction,
            read: { axElement.value(for: attribute) }, reportError: reportError)
    }
}
