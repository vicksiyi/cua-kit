import ApplicationServices

extension UIElementProtocol {
    // isFocused 0x1007abf94 -> shared cached Bool getter 0x1007ac3f0.
    var isFocused: Bool {
        guard let partial = cache.attributes[UIElementAttribute(kAXFocusedAttribute)] else { return false }
        return (try? decodeAXBool(partial.value.value, throwingOnFailure: false)) ?? false
    }

    // isSelected 0x1007abc80: only ABSENT AXSelected enters traits fallback.
    // A present false, malformed value or failed decode must not read traits.
    func isSelected(readTraitsRawValue: () -> UInt64?) -> Bool {
        if let partial = cache.attributes[UIElementAttribute(kAXSelectedAttribute)] {
            return (try? decodeAXBool(partial.value.value, throwingOnFailure: false)) ?? false
        }
        return readTraitsRawValue().map { $0 & (1 << 3) != 0 } ?? false
    }

    // traits getter 0x1007af9d4 requests UInt64 through value(for:), strict on
    // fresh reads. Keep raw value explicit until the complete OptionSet exists.
    func catalystTraitsRawValue(
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> UInt64? {
        let attribute = UIElementAttribute("AXTraits")
        return uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXUInt64($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) }, read: read,
                        decode: { try? decodeAXUInt64($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXUInt64($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }
}
