import ApplicationServices

extension TransformedUIElement {
    // Native attribute initializer 0x10079c8e0 spells ChromeAXNodeId.
    func supportsChromeNodeID() -> Bool {
        uiElementIsAttributeSupported(UIElementAttribute("ChromeAXNodeId"),
            readCache: { cache }, freshSupportedAttributes: { Set(axElement.supportedAttributes) })
    }

    // The cached/fresh marker readers in tag 12 use the same typed-value
    // policy as other UIElementProtocol attributes, including error logging.
    func textMarker(for attribute: UIElementAttribute, reportError: (Error) -> Void) -> UITextMarker? {
        uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXMarker($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { element.attributeIsKnownUnsupported(attribute) },
                        read: { axElement.value(for: attribute) },
                        decode: { try? decodeAXMarker($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXMarker($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }

    func nextLineEndTextMarker(after marker: UITextMarker) throws -> UITextMarker? {
        let parameter = try AXEncodedValue(wrapping: marker)
        guard let partial = try axElement.parameterizedValue(
            for: UIElementAttribute("AXNextLineEndTextMarkerForTextMarker"), parameter: parameter) else { return nil }
        return try decodeAXMarker(partial.value.value, throwingOnFailure: true)
    }
}
