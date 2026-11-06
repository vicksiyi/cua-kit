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
