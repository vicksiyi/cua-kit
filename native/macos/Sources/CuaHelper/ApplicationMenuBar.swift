import ApplicationServices

extension ApplicationUIElement {
    // Source0x100718d48: cached lenient decode, then strict fresh decode of
    // AXMenuBar, with the same typed provider initializer and error boundary.
    func menuBarValue(reportError: (Error) -> Void) -> MenuBarUIElement? {
        let attribute = UIElementAttribute("AXMenuBar")
        return uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: {
            guard let partial = cache.attributes[attribute] else { return nil }
            return try? decodeAXUIElement(partial.value.value, throwingOnFailure: false,
                initialize: { MenuBarUIElement(element: $0) })
        }, uncachedValue: { ignore in
            uiElementUncachedValue(operation: {
                try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                    isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                    read: { axElement.value(for: attribute) },
                    decode: { try? decodeAXUIElement($0.value.value, throwingOnFailure: false,
                        initialize: { MenuBarUIElement(element: $0) }) },
                    decodeThrowing: { try decodeAXUIElement($0.value.value, throwingOnFailure: true,
                        initialize: { MenuBarUIElement(element: $0) }) })
            }, reportError: reportError)
        })
    }
    var menuBar: MenuBarUIElement? { menuBarValue(reportError: reportAttributeReadError) }
}
