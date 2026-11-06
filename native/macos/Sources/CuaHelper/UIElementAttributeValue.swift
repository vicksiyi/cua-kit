// Recovered dispatch in the typed attribute reader at 0x1007a7600.
// The closures represent the original cachedValue/uncachedValue accessors;
// cache storage, AX decoding and typed marker wrappers remain separate work.
func uiElementAttributeValue<Value>(
    ignoringTypeMismatch: Bool,
    cachedValue: () -> Value?,
    uncachedValue: (Bool) -> Value?
) -> Value? {
    if let value = cachedValue() { return value }
    return uncachedValue(ignoringTypeMismatch)
}
