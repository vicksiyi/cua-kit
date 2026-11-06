import ApplicationServices

// AXValue branch of AXEncodedValue.unwrappedThrowing at 0x1006e9510.
// This is deliberately not a replacement for its AXUIElement/marker/array branches.
func decodeAXValue<Value>(
    _ value: AXValue,
    throwingOnFailure: Bool,
    as type: Value.Type = Value.self
) throws -> Value? {
    try decodeUnpackedAXValue(throwingOnFailure: throwingOnFailure, as: type) {
        try unpackAXValue(value)
    }
}

// Keep the Optional<Any> cast intact: Optional targets can accept a nil payload.
// The original tries the requested type BEFORE interpreting an AXError payload.
func decodeUnpackedAXValue<Value>(
    throwingOnFailure: Bool,
    as type: Value.Type,
    unpack: () throws -> Any?
) throws -> Value? {
    let value = try unpack()
    if let converted = value as? Value { return converted }
    if let error = value as? AXError {
        if error == .noValue { return nil }
        if throwingOnFailure { throw UIElementError.axError(error) }
        return nil
    }
    if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(type) }
    return nil
}
