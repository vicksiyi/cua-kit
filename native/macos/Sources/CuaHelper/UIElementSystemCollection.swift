import ApplicationServices

// Compose the recovered CFArray decoder and system element constructor.
// Transaction is explicit until the original complete TaskLocal owner exists.
// No global/default empty cache and no implicit transaction lifetime are added.
func decodeSystemCFUIElementArray(
    _ raw: AnyObject,
    transaction: UIElementTransactionCache?
) -> [UIElement]? {
    decodeCFUIElementArray(raw) { element in
        UIElement(systemElement: element, transaction: transaction)
    }
}

extension UIElement {
    // Read/provider and reporting remain explicit: raw AX reads cannot invent
    // the original partial-value descriptors or replace the MockProvider layer.
    func systemElementCollectionValue(
        for attribute: UIElementAttribute,
        transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> [UIElement] {
        elementCollectionValue(for: attribute, read: read, decode: { partial, strict in
            try decodeUIElementArray(partial.value.value, throwingOnFailure: strict) {
                UIElement(systemElement: $0, transaction: transaction)
            }
        }, reportError: reportError)
    }
}
