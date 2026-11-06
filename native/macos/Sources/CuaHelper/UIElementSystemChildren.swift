import ApplicationServices

extension UIElement {
    // Ordinary children getter 0x1007a7ea0 forwards AXChildren to the typed
    // collection reader. It is distinct from childrenPreferringVisible.
    func childrenValue(
        transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> [UIElement] {
        systemElementCollectionValue(for: UIElementAttribute(kAXChildrenAttribute),
            transaction: transaction, read: read, reportError: reportError)
    }

    func systemChildren(
        transaction: UIElementTransactionCache?, reportError: (Error) -> Void
    ) -> [UIElement] {
        childrenValue(transaction: transaction,
            read: { readSystemAXAttributeValue(axElement, UIElementAttribute(kAXChildrenAttribute)) },
            reportError: reportError)
    }

    func systemChildrenPreferringVisible(
        transaction: UIElementTransactionCache?, reportError: (Error) -> Void
    ) -> [UIElement] {
        systemChildrenPreferringVisible(transaction: transaction,
            freshSupportedAttributes: { Set(decodedAXSupportedAttributes(readRawAXAttributeNames(axElement))) },
            readArrayCount: { readSystemAXArrayCount(axElement, $0) },
            read: { readSystemAXAttributeValue(axElement, $0) }, reportError: reportError)
    }
}
