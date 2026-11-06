import ApplicationServices

// Original immutable storage. Memberwise construction is useful for assembled
// transaction data; the source AX-element initializer and its cache-building
// policy remain separate work, rather than defaulting to a fabricated cache.
struct UIElementCache {
    let supportedAttributes: Set<UIElementAttribute>
    let attributes: [UIElementAttribute: AXPartialValue]
    let transactionAttributes: Set<UIElementAttribute>?
}

struct UIElement {
    let axElement: AXUIElement
    let cache: UIElementCache
}
