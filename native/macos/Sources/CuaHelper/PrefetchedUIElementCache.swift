import ApplicationServices

// Extracted transaction-table hit branch of the native cache constructor
// (0x1007658fc through the return at 0x10076625c). A nil result means this
// branch did not supply a cache; the caller must follow the separate fallback
// path. An existing empty attribute dictionary is still a successful hit.
func prefetchedUIElementCache(
    element: AXUIElement,
    attributeTable: [AXUIElement: [UIElementAttribute: AXPartialValue]],
    requestedAttributes: Set<UIElementAttribute>
) -> UIElementCache? {
    guard let attributes = attributeTable[element] else { return nil }
    return UIElementCache(
        supportedAttributes: Set(attributes.keys),
        attributes: attributes,
        transactionAttributes: requestedAttributes
    )
}
