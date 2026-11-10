import ApplicationServices

func uiElementFocusSelectionElements<Element>(supported: Set<UIElementAttribute>,
    count: (UIElementAttribute) throws -> Int?, read: (UIElementAttribute) -> [Element]?
) -> [Element]? {
    guard let attribute = uiElementFocusSelectionAttribute(supported: supported, count: count) else { return nil }
    return read(attribute)
}

extension UIElement {
    // Candidate result0x100767bf4: cached lenient array decode first; a nil
    // decode falls through to one uncached read of the SAME chosen attribute.
    // Preserve empty arrays and do not select another attribute after failure.
    func selectedElementsForFocus(reportError: (Error) -> Void) -> [UIElement]? {
        uiElementFocusSelectionElements(supported: cache.supportedAttributes,
            count: { try count(for: $0) }, read: { attribute in
                uiElementAttributeValue(ignoringTypeMismatch: true, cachedValue: {
                    guard let partial = cache.attributes[attribute] else { return nil }
                    return try? decodeUIElementArray(partial.value.value, throwingOnFailure: false,
                        initialize: { UIElement(element: $0) })
                }, uncachedValue: { _ in
                    uiElementUncachedValue(operation: {
                        try uiElementUncachedValueThrowing(ignoringTypeMismatch: true,
                            isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                            read: { axElement.value(for: attribute) },
                            decode: { try? decodeUIElementArray($0.value.value, throwingOnFailure: false,
                                initialize: { UIElement(element: $0) }) },
                            decodeThrowing: { try decodeUIElementArray($0.value.value, throwingOnFailure: false,
                                initialize: { UIElement(element: $0) }) })
                    }, reportError: reportError)
                })
            })
    }
}
