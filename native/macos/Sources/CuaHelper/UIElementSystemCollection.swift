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

extension UIElement {
    func systemChildrenPreferringVisible(
        transaction: UIElementTransactionCache?,
        freshSupportedAttributes: () -> Set<UIElementAttribute>,
        count: (UIElementAttribute) throws -> Int?,
        read: (UIElementAttribute) -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> [UIElement] {
        uiElementChildrenPreferringVisible(
            freshSupportedAttributes: freshSupportedAttributes, count: count,
            isAttributeSupported: { attribute in
                uiElementIsAttributeSupported(attribute, readCache: { cache },
                    freshSupportedAttributes: freshSupportedAttributes)
            }, collectionValue: { attribute in
                systemElementCollectionValue(for: attribute, transaction: transaction,
                    read: { read(attribute) }, reportError: reportError)
            })
    }
}

extension UIElement {
    // readArrayCount retains the original provider/AX boundary; it is not
    // replaced with a full attribute read followed by decoded array length.
    func elementCount(
        for attribute: UIElementAttribute,
        readArrayCount: () -> (error: AXError, count: Int)
    ) throws -> Int? {
        try uiElementCount(isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
            cachedValue: { cache.attributes[attribute] }, readArrayCount: readArrayCount)
    }
}

extension UIElement {
    func systemChildrenPreferringVisible(
        transaction: UIElementTransactionCache?,
        freshSupportedAttributes: () -> Set<UIElementAttribute>,
        readArrayCount: (UIElementAttribute) -> (error: AXError, count: Int),
        read: (UIElementAttribute) -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> [UIElement] {
        systemChildrenPreferringVisible(transaction: transaction,
            freshSupportedAttributes: freshSupportedAttributes,
            count: { attribute in
                try elementCount(for: attribute, readArrayCount: { readArrayCount(attribute) })
            }, read: read, reportError: reportError)
    }
}

extension UIElement {
    // Explicit system-only adapter. The original TaskLocal MockProvider selection
    // must precede this path when the complete provider layer is connected.
    func systemElementCount(for attribute: UIElementAttribute) throws -> Int? {
        try elementCount(for: attribute) { readSystemAXArrayCount(axElement, attribute) }
    }
}
