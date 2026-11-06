import ApplicationServices

// Throwing read body 0x1007ad658..0x1007ad938, underneath uncachedValue.
// Dependencies retain the original provider/partial-value decoder boundaries.
func uiElementUncachedValueThrowing<Value>(
    ignoringTypeMismatch: Bool,
    isKnownUnsupported: () -> Bool,
    read: () -> (error: AXError, value: AXPartialValue?),
    decode: (AXPartialValue) -> Value?,
    decodeThrowing: (AXPartialValue) throws -> Value?
) throws -> Value? {
    if isKnownUnsupported() { return nil }
    let result = read()
    guard result.error == .success || result.error == .noValue || result.error == .attributeUnsupported else {
        throw UIElementError.axError(result.error)
    }
    guard let value = result.value else { return nil }
    if ignoringTypeMismatch { return decode(value) }
    return try decodeThrowing(value)
}

// Outer accessor 0x1007ae414..0x1007ae5f8: a thrown read/decode error
// is reported once, then converted to nil. Logging backend is a dependency.
func uiElementUncachedValue<Value>(
    operation: () throws -> Value?,
    reportError: (Error) -> Void
) -> Value? {
    do { return try operation() }
    catch { reportError(error); return nil }
}

extension UIElement {
    // Compose recovered accessors for String without bypassing the provider
    // boundary or pretending a raw OS read supplies partial-value descriptors.
    func stringValue(
        for attribute: UIElementAttribute,
        ignoringTypeMismatch: Bool,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> String? {
        uiElementAttributeValue(ignoringTypeMismatch: ignoringTypeMismatch,
            cachedValue: { cachedStringValue(for: attribute) },
            uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXString($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXString($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }
}
