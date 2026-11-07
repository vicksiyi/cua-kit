// UIElementProtocol.cachedValue at 0x1007aeea4 calls the raw cached lookup
// 0x1007af0d0, then AXPartialValue.decoded. Keep the entire partial value:
// generic decoding may need either descriptor, unlike scalar String decoding.
func uiElementCachedValue<Value>(
    _ attribute: UIElementAttribute,
    readCache: () -> UIElementCache,
    decode: (AXPartialValue) -> Value?
) -> Value? {
    guard let partial = readCache().attributes[attribute] else { return nil }
    return decode(partial)
}

extension UIElementProtocol {
    // Concrete String specialization; full generic decoding remains separate.
    func cachedStringValue(for attribute: UIElementAttribute) -> String? {
        uiElementCachedValue(attribute, readCache: { cache }) { partial in
            try? decodeAXString(partial.value.value, throwingOnFailure: false)
        }
    }
}
