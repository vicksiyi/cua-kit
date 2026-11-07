import ApplicationServices

extension UIElementProtocol {
    // 0x10076ca5c..0x10076cca8. An existing scope can be reused, but the
    // callback receives this receiver, not the enclosing transaction's root.
    func withSubtreeTransaction<Result>(additionalAttributes: [UIElementAttribute],
        maxChildCount: Int, perform work: (any UIElementProtocol) throws -> Result
    ) rethrows -> Result {
        try withSubtreeTransaction(additionalAttributes: additionalAttributes,
            maxChildCount: maxChildCount, reader: .provider, perform: work)
    }

    func withSubtreeTransaction<Result>(additionalAttributes: [UIElementAttribute],
        maxChildCount: Int, reader: AXHierarchyReader,
        perform work: (any UIElementProtocol) throws -> Result
    ) rethrows -> Result {
        // Keep the two current reads in source order. Disabled prefetch only
        // skips construction when there is already a transaction installed.
        if !UIElementTreeTransaction.prefetchEnabled,
           UIElementTreeTransaction.current != nil {
            return try work(self)
        }
        if let transaction = UIElementTreeTransaction.current,
           transaction.cache.attributeTable[axElement] != nil {
            return try work(self)
        }
        return try subtreeTransaction(additionalAttributes: additionalAttributes,
            maxChildCount: maxChildCount, reader: reader).perform(work: work)
    }
}
