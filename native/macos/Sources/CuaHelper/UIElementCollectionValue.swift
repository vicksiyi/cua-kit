import ApplicationServices

extension UIElementProtocol {
    // Concrete array-reader composition at 0x100724514..<0x1007248bc.
    // Cached decoding suppresses errors; uncached decoding is strict, reports
    // errors once, and yields [] on absent/failed results. An empty cached array
    // is a hit. The decoder boundary retains full AXPartialValue descriptors.
    func elementCollectionValue<Element>(
        for attribute: UIElementAttribute,
        read: () -> (error: AXError, value: AXPartialValue?),
        decode: (AXPartialValue, Bool) throws -> [Element]?,
        reportError: (Error) -> Void
    ) -> [Element] {
        if let partial = cache.attributes[attribute],
           let cached = try? decode(partial, false) { return cached }
        return uiElementUncachedValue(operation: {
            try uiElementUncachedValueThrowing(ignoringTypeMismatch: false,
                isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                read: read,
                decode: { try? decode($0, false) },
                decodeThrowing: { try decode($0, true) })
        }, reportError: reportError) ?? []
    }
}
