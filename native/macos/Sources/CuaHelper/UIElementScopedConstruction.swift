import ApplicationServices

extension UIElement {
    // 0x10072187c reads the complete TaskLocal owner once, extracts its cache,
    // and then calls the cache constructor. Keep provider-dependent reads
    // explicit until their original dispatch is restored.
    init(
        element: AXUIElement,
        constructCache: (AXUIElement, UIElementTransactionCache?) -> UIElementCache
    ) {
        self.init(element: element,
            readTransaction: { UIElementTreeTransaction.current?.cache },
            constructCache: constructCache)
    }
}
