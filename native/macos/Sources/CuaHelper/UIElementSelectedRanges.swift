import ApplicationServices

extension UIElementProtocol {
    private func selectedRangeValue<Value>(for attribute: UIElementAttribute,
        read: () -> (error: AXError, value: AXPartialValue?),
        decode: (AnyObject, Bool) throws -> Value?, reportError: (Error) -> Void
    ) -> Value? {
        uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) { try? decode($0.value.value, false) }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) }, read: read,
                        decode: { try? decode($0.value.value, false) },
                        decodeThrowing: { try decode($0.value.value, true) })
                }, reportError: reportError)
            })
    }

    // Native78ebe0/78e994 request value<T>(ignoringTypeMismatch:false),
    // specializing CFRange / UITextMarkerRange with existing CF-first decoders.
    func selectedTextRangeValue(read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void) -> CFRange? {
        selectedRangeValue(for: UIElementAttribute("AXSelectedTextRange"), read: read,
            decode: { try decodeAXRange($0, throwingOnFailure: $1) }, reportError: reportError)
    }

    func selectedTextMarkerRangeValue(read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void) -> UITextMarkerRange? {
        selectedRangeValue(for: UIElementAttribute("AXSelectedTextMarkerRange"), read: read,
            decode: { try decodeAXMarkerRange($0, throwingOnFailure: $1) }, reportError: reportError)
    }

    var selectedTextRange: CFRange? {
        selectedTextRangeValue(read: { axElement.value(for: UIElementAttribute("AXSelectedTextRange")) },
            reportError: reportAttributeReadError)
    }
    var selectedTextMarkerRange: UITextMarkerRange? {
        selectedTextMarkerRangeValue(read: { axElement.value(for: UIElementAttribute("AXSelectedTextMarkerRange")) },
            reportError: reportAttributeReadError)
    }
}
