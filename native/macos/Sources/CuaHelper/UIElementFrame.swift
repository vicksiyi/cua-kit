import ApplicationServices

extension UIElementAttribute {
    // Literal recovered at 0x10079c218; not the position/size attribute pair.
    static let frame = UIElementAttribute("AXFrame")
}

extension UIElement {
    // Window specialization 0x1007575ac..<0x100757a50. AXFrame is preferred;
    // only a nil result (including logged read/decode errors) enters fallback.
    // Position/size keep separate typed provider boundaries; UIElementGeometry
    // composes their concrete readers through the readAttribute overload.
    func frameValue(
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void,
        position: () -> CGPoint?,
        size: () -> CGSize?
    ) -> CGRect? {
        let attribute = UIElementAttribute.frame
        let frame: CGRect? = uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXRect($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXRect($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXRect($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
        if let frame { return frame }
        guard let position = position() else { return nil }
        guard let size = size() else { return nil }
        return CGRect(origin: position, size: size)
    }
}
