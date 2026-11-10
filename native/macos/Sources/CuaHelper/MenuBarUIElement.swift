import ApplicationServices

// Source constructor0x100724de0 uses the shared provider cache boundary.
struct MenuBarUIElement: UIElementProtocol {
    let axElement: AXUIElement
    let cache: UIElementCache
    static var role: UIElementRole? { UIElementRole("AXMenuBar") }
    init(element: AXUIElement) {
        let provider = UIElement(element: element)
        axElement = provider.axElement; cache = provider.cache
    }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement; self.cache = cache
    }

    // Source0x100724ef4: cached and fresh decoding are both lenient. Missing
    // or failed results yield[]; a cached[] remains final.
    func itemsValue(reportError: (Error) -> Void) -> [MenuBarItemUIElement] {
        let attribute = UIElementAttribute("AXChildren")
        return uiElementAttributeValue(ignoringTypeMismatch: true, cachedValue: {
            guard let partial = cache.attributes[attribute] else { return nil }
            return try? decodeUIElementArray(partial.value.value, throwingOnFailure: false,
                initialize: { MenuBarItemUIElement(element: $0) })
        }, uncachedValue: { _ in
            uiElementUncachedValue(operation: {
                try uiElementUncachedValueThrowing(ignoringTypeMismatch: true,
                    isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                    read: { axElement.value(for: attribute) },
                    decode: { try? decodeUIElementArray($0.value.value, throwingOnFailure: false,
                        initialize: { MenuBarItemUIElement(element: $0) }) },
                    decodeThrowing: { try decodeUIElementArray($0.value.value, throwingOnFailure: false,
                        initialize: { MenuBarItemUIElement(element: $0) }) })
            }, reportError: reportError)
        }) ?? []
    }
    var items: [MenuBarItemUIElement] { itemsValue(reportError: reportAttributeReadError) }
}
