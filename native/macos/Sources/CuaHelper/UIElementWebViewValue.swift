import ApplicationServices

extension UIElement {
    func isInsideWebView(
        transaction: UIElementTransactionCache?,
        readParent: @escaping (AXUIElement, UIElementAttribute) -> (error: AXError, value: AXPartialValue?),
        bundleIdentifier: (AXUIElement) -> String?,
        reportError: @escaping (Error) -> Void
    ) -> Bool {
        uiElementIsInsideWebView(self, parent: { element in
            element.parentValue(transaction: transaction, read: {
                readParent(element.axElement, UIElementAttribute("AXParent"))
            }, reportError: reportError)
        }, role: { $0.role }, bundleIdentifier: { bundleIdentifier($0.axElement) })
    }
}
