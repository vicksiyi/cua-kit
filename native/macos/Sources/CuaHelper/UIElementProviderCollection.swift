import ApplicationServices

extension UIElementProtocol {
    func elementCollectionValue(for attribute: UIElementAttribute,
        reportError: (Error) -> Void
    ) -> [UIElement] {
        elementCollectionValue(for: attribute, as: UIElement.self, reportError: reportError)
    }

    func elementCollectionValue<Element: UIElementProtocol>(for attribute: UIElementAttribute,
        as type: Element.Type, reportError: (Error) -> Void
    ) -> [Element] {
        elementCollectionValue(for: attribute,
            read: { axElement.value(for: attribute) },
            decode: { partial, strict in
                try decodeUIElementArray(partial.value.value, throwingOnFailure: strict) {
                    Element(element: $0)
                }
            }, reportError: reportError)
    }

    func childrenValue(reportError: (Error) -> Void) -> [UIElement] {
        elementCollectionValue(for: UIElementAttribute(kAXChildrenAttribute), reportError: reportError)
    }

    func count(for attribute: UIElementAttribute) throws -> Int? {
        try uiElementCount(isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
            cachedValue: { cache.attributes[attribute] },
            readArrayCount: { axElement.arrayCount(for: attribute) })
    }

    func childrenPreferringVisible(reportError: (Error) -> Void) -> [UIElement] {
        uiElementChildrenPreferringVisible(
            freshSupportedAttributes: { Set(axElement.supportedAttributes) },
            count: { try count(for: $0) },
            isAttributeSupported: { attribute in
                uiElementIsAttributeSupported(attribute, readCache: { cache },
                    freshSupportedAttributes: { Set(axElement.supportedAttributes) })
            }, collectionValue: { elementCollectionValue(for: $0, reportError: reportError) })
    }
}
