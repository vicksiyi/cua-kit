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

extension UIElement {
    // Shared focused-element read pipeline for normal and ViewBridge retry
    // reads. Each retry repeats the read; it does not reuse an earlier result.
    func resolveViewBridgePrimaryFocusPID(
        transaction: UIElementTransactionCache?,
        activity: SyntheticFocusActivity = .shared,
        now: () -> Double,
        sleepMicroseconds: (UInt32) -> Void,
        resolveElement: (UIElement?) -> Int32,
        reportError: (Error) -> Void
    ) -> Int32 {
        let read = { self.focusedUIElementValue(transaction: transaction, reportError: reportError) }
        return resolveViewBridgePrimaryFocusPIDUsingReads(initialRead: read, retryRead: read,
            resolveElement: resolveElement, activity: activity, now: now,
            sleepMicroseconds: sleepMicroseconds)
    }
}
