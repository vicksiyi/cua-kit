import ApplicationServices

extension UIElementAttribute {
    // Original initializer 0x10079cab8: the leading underscore is significant.
    static let exhibitsMacCatalystBehavior = UIElementAttribute("_AXExhibitsMacCatalystBehavior")
}

extension UIElement {
    // ApplicationUIElement.isCatalystApp, 0x100715974..<0x100715d4c.
    // Keep provider reads injected until the original application wrapper exists.
    func applicationIsCatalyst(
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> Bool {
        let attribute = UIElementAttribute.exhibitsMacCatalystBehavior
        return uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXBool($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXBool($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXBool($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            }) ?? false
    }
}
