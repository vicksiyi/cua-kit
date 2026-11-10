extension TransformedUIElement {
    // Native value type0x10076c9f8 stores the tree together with the complete
    // transaction and the same monitor reference. It does not just retain AX
    // handles or rebuild a transaction when the cached tree is read.
    struct TreeCache {
        let tree: UIElementTree<TransformedUIElement>
        let transaction: UIElementTreeTransaction
        let invalidationMonitor: UIElementTreeInvalidationMonitor

        init(tree: UIElementTree<TransformedUIElement>, transaction: UIElementTreeTransaction,
            invalidationMonitor: UIElementTreeInvalidationMonitor) {
            self.tree = tree
            self.transaction = transaction
            self.invalidationMonitor = invalidationMonitor
        }
    }
}
