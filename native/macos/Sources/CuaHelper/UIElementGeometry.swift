import ApplicationServices

extension UIElementAttribute {
    static let position = UIElementAttribute("AXPosition")
    static let size = UIElementAttribute("AXSize")
}

extension UIElementProtocol {
    // Window specialization 0x10079d594 -> 0x10079d5c4; cached lenient, fresh strict.
    func positionValue(
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> CGPoint? {
        let attribute = UIElementAttribute.position
        return uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXPoint($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXPoint($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXPoint($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }

    // Window specialization 0x10079da24; cached lenient, fresh strict.
    func sizeValue(
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> CGSize? {
        let attribute = UIElementAttribute.size
        return uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXSize($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXSize($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXSize($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }

    // Compose all three typed reads against the same immutable element cache.
    // The provider is still injected: this does not replace MockProvider dispatch.
    func frameValue(
        readAttribute: (UIElementAttribute) -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> CGRect? {
        frameValue(read: { readAttribute(.frame) }, reportError: reportError,
            position: { positionValue(read: { readAttribute(.position) }, reportError: reportError) },
            size: { sizeValue(read: { readAttribute(.size) }, reportError: reportError) })
    }
}
