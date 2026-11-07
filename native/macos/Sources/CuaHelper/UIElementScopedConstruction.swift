import ApplicationServices

extension UIElement {
    // 0x10072187c reads the complete TaskLocal owner once, extracts its cache,
    // and then calls the cache constructor. The concrete no-closure overload
    // supplies the restored provider-aware construction path.
    init(
        element: AXUIElement,
        constructCache: (AXUIElement, UIElementTransactionCache?) -> UIElementCache
    ) {
        self.init(element: element,
            readTransaction: { UIElementTreeTransaction.current?.cache },
            constructCache: constructCache)
    }
}
