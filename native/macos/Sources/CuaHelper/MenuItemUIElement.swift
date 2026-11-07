import ApplicationServices

// Shared native wrapper initializer at 0x100721e3c; static role 0x100721db8.
struct MenuItemUIElement: UIElementProtocol {
    let axElement: AXUIElement
    let cache: UIElementCache
    static var role: UIElementRole? { .menuItem }
    init(element: AXUIElement) {
        let value = UIElement(element: element)
        axElement = value.axElement; cache = value.cache
    }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement; self.cache = cache
    }
}


extension MenuItemUIElement {
    var items: [MenuItemUIElement] { menuItemsValue(reportError: reportAttributeReadError) }
    var cmdChar: String? {
        let attribute = UIElementAttribute(kAXMenuItemCmdCharAttribute)
        return stringValue(for: attribute, ignoringTypeMismatch: false,
            read: { axElement.value(for: attribute) }, reportError: reportAttributeReadError)
    }
    var cmdModifiers: Int? {
        let attribute = UIElementAttribute(kAXMenuItemCmdModifiersAttribute)
        return uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: {
            uiElementCachedValue(attribute, readCache: { cache }) {
                try? decodeAXInt($0.value.value, throwingOnFailure: false)
            }
        }, uncachedValue: { ignore in
            uiElementUncachedValue(operation: {
                try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                    isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                    read: { axElement.value(for: attribute) },
                    decode: { try? decodeAXInt($0.value.value, throwingOnFailure: false) },
                    decodeThrowing: { try decodeAXInt($0.value.value, throwingOnFailure: true) })
            }, reportError: reportAttributeReadError)
        })
    }
}
