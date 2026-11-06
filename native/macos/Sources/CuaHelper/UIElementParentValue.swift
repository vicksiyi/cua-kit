import ApplicationServices

extension UIElement {
    // parent getter calls value<UIElement>(AXParent, ignoringTypeMismatch:false),
    // 0x1007b0214..<0x1007b029c.
    func elementValue(
        for attribute: UIElementAttribute,
        transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> UIElement? {
        uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXUIElement($0.value.value, throwingOnFailure: false, transaction: transaction)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXUIElement($0.value.value, throwingOnFailure: false, transaction: transaction) },
                        decodeThrowing: { try decodeAXUIElement($0.value.value, throwingOnFailure: true, transaction: transaction) })
                }, reportError: reportError)
            })
    }

}

extension UIElement {
    func parentValue(
        transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> UIElement? {
        elementValue(for: UIElementAttribute("AXParent"), transaction: transaction,
            read: read, reportError: reportError)
    }

    func systemParentChain(
        maxDepth: Int = 300,
        includingSelf: Bool,
        transaction: UIElementTransactionCache?,
        read: @escaping (AXUIElement, UIElementAttribute) -> (error: AXError, value: AXPartialValue?),
        reportError: @escaping (Error) -> Void
    ) -> UnfoldSequence<UIElement, (node: UIElement?, depth: Int)> {
        uiElementParentChain(of: self, maxDepth: maxDepth, includingSelf: includingSelf) { element in
            element.parentValue(transaction: transaction,
                read: { read(element.axElement, UIElementAttribute("AXParent")) }, reportError: reportError)
        }
    }
}
