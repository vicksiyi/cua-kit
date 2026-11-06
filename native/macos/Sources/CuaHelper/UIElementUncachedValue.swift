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
