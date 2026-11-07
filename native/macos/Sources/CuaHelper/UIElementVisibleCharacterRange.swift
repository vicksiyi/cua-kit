import ApplicationServices

extension UIElementAttribute {
    static let visibleCharacterRange = UIElementAttribute("AXVisibleCharacterRange")
}

extension UIElement {
    func visibleCharacterRangeValue(reportError: (Error) -> Void) -> NSRange? {
        visibleCharacterRangeValue(read: { axElement.value(for: .visibleCharacterRange) },
            reportError: reportError)
    }

    // Source 0x1007603dc..<0x1007607d8. Cache decode is lenient; a
    // missing/invalid cached range falls through to a strict provider read.
    func visibleCharacterRangeValue(
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> NSRange? {
        let attribute = UIElementAttribute.visibleCharacterRange
        let range: CFRange? = uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXRange($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXRange($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXRange($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
        return range.map { NSRange(location: $0.location == -1 ? NSNotFound : $0.location,
            length: $0.length) }
    }
}
