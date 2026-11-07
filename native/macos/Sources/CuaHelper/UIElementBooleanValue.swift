import ApplicationServices

extension UIElementProtocol {
    // Bool scalar accessor used by the safe-enforcement AXFrontmost read
    // (0x1007422e0..0x1007424d4). Reuse cached/uncached policy and Bool decoder.
    func booleanValue(for attribute: UIElementAttribute, ignoringTypeMismatch: Bool,
        read: () -> (error: AXError, value: AXPartialValue?), reportError: (Error) -> Void) -> Bool? {
        uiElementAttributeValue(ignoringTypeMismatch: ignoringTypeMismatch,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXBool($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) }, read: read,
                        decode: { try? decodeAXBool($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXBool($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }
    func booleanValue(for attribute: UIElementAttribute, ignoringTypeMismatch: Bool,
        reportError: (Error) -> Void) -> Bool? {
        booleanValue(for: attribute, ignoringTypeMismatch: ignoringTypeMismatch,
            read: { axElement.value(for: attribute) }, reportError: reportError)
    }
}
