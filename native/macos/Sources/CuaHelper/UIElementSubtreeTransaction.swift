import ApplicationServices

// Composition of the enabled and disabled paths at 0x10076bd70. Reads and
// concrete root wrapping remain explicit provider boundaries. The original
// wrapper constructs a fresh UIElement, not a copy of the caller's root type.
func constructUIElementSubtreeTransaction(
    element: AXUIElement,
    additionalAttributes: [UIElementAttribute],
    maxChildCount: Int,
    supportedAttributes: () -> Set<UIElementAttribute>,
    bundleIdentifier: () -> String?,
    readHierarchy: (AXUIElement, [UIElementAttribute], [UIElementAttribute], Int)
        -> [AXUIElement: [UIElementAttribute: AXPartialValue]],
    makeElement: (AXUIElement, UIElementTransactionCache) -> any UIElementProtocol
) -> UIElementTreeTransaction {
    let table: [AXUIElement: [UIElementAttribute: AXPartialValue]]
    let requested: Set<UIElementAttribute>
    if UIElementTreeTransaction.prefetchEnabled {
        let selection = subtreeAttributeSelection(additionalAttributes: additionalAttributes,
            supportedAttributes: supportedAttributes, bundleIdentifier: bundleIdentifier)
        table = readHierarchy(element, selection.arrayAttributes,
            selection.requestedAttributes, maxChildCount)
        requested = selection.transactionAttributes
    } else {
        table = [:]
        requested = []
    }
    let cache = UIElementTransactionCache(attributeTable: table,
        requestedAttributes: requested,
        fallbackElements: UIElementFallbackCache(initialState: [:]))
    let frequencies = uiElementRoleFrequencies(table)
    let root = makeElement(element, cache)
    return UIElementTreeTransaction(element: root, cache: cache, roleFrequencyTable: frequencies)
}
