import ApplicationServices

// 0x1007b04f4..0x1007b06a0 and uncached helper 0x1007b0958..0x1007b0af8.
// A present cached partial is final even if decoding returns nil; maxCount only
// controls uncached reads, never truncates an already cached array.
func uiElementPartialArrayValue<Element>(
    cachedValue: () -> AXPartialValue?, isKnownUnsupported: () -> Bool,
    maxCount: Int?,
    readValue: () -> (error: AXError, value: AXPartialValue?),
    readArray: (Int) -> (error: AXError, value: AXPartialValue?),
    decode: (AXPartialValue) -> [Element]?
) throws -> (array: [Element], subsetDescriptor: AXArraySubsetDescriptor?)? {
    let partial: AXPartialValue
    if let cached = cachedValue() {
        partial = cached
    } else {
        guard !isKnownUnsupported() else { return nil }
        let result = maxCount.map(readArray) ?? readValue()
        // Both native error tables contain -25212 and -25205. Preserve a value
        // supplied alongside either tolerated error, rather than replacing nil.
        guard result.error == .success || result.error == .noValue || result.error == .attributeUnsupported else {
            throw UIElementError.axError(result.error)
        }
        guard let value = result.value else { return nil }
        partial = value
    }
    return decodedAXPartialArray(subsetDescriptor: partial.arraySubsetDescriptor,
        decode: { decode(partial) })
}

extension UIElementProtocol {
    // Concrete [UIElement] specialization; other generic decoder targets remain
    // separate until the complete encoded-value unwrapping surface is restored.
    func partialArrayValue(for attribute: UIElementAttribute, maxCount: Int?) throws
        -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)? {
        try uiElementPartialArrayValue(cachedValue: { cache.attributes[attribute] },
            isKnownUnsupported: { attributeIsKnownUnsupported(attribute) }, maxCount: maxCount,
            readValue: { axElement.value(for: attribute) },
            readArray: { axElement.arrayValue(for: attribute, index: 0, maxValues: $0, countIfKnown: nil) },
            decode: { partial in
                try? decodeUIElementArray(partial.value.value, throwingOnFailure: false,
                    initialize: { UIElement(element: $0) })
            })
    }
}
