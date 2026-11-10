import ApplicationServices

// Source0x1007a55b8: a complete cached partial is final even when decode
// throws or returns nil. Only missing/incomplete cache falls through to AX.
func uiElementCompleteCollectionValue<Element>(cached: () -> AXPartialValue?,
    decode: (AXPartialValue) throws -> [Element]?,
    uncached: () -> [Element]?
) -> [Element]? {
    if let partial = cached(), partial.arraySubsetDescriptor?.isComplete != false {
        return try? decode(partial)
    }
    return uncached()
}

extension UIElementProtocol {
    func completeAXElementCollectionValue(for attribute: UIElementAttribute,
        reportError: (Error) -> Void) -> [AXUIElement]? {
        uiElementCompleteCollectionValue(cached: { cache.attributes[attribute] },
            decode: { try decodeUIElementArray($0.value.value, throwingOnFailure: false,
                initialize: { $0 }) },
            uncached: {
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: false,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: { axElement.value(for: attribute) },
                        decode: { try? decodeUIElementArray($0.value.value, throwingOnFailure: false,
                            initialize: { $0 }) },
                        decodeThrowing: { try decodeUIElementArray($0.value.value, throwingOnFailure: true,
                            initialize: { $0 }) })
                }, reportError: reportError)
            })
    }
}
