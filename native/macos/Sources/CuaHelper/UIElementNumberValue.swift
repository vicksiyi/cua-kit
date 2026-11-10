import ApplicationServices

extension UIElementProtocol {
    // NSNumber specialization used by scroll-frame current AXValue reads.
    func numberValue(for attribute: UIElementAttribute, ignoringTypeMismatch: Bool,
        read: () -> (error: AXError, value: AXPartialValue?), reportError: (Error) -> Void) -> NSNumber? {
        uiElementAttributeValue(ignoringTypeMismatch: ignoringTypeMismatch,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXNumber($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) }, read: read,
                        decode: { try? decodeAXNumber($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXNumber($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }
    func numberValue(for attribute: UIElementAttribute, ignoringTypeMismatch: Bool,
        reportError: (Error) -> Void) -> NSNumber? {
        numberValue(for: attribute, ignoringTypeMismatch: ignoringTypeMismatch,
            read: { axElement.value(for: attribute) }, reportError: reportError)
    }
}
