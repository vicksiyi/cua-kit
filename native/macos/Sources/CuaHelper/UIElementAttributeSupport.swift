import ApplicationServices

// UIElementProtocol.attributeIsKnownUnsupported, 0x1007b0854..0x1007b0958.
// Keep cache getter calls lazy and in source order: protocol conformers need
// not have the immutable storage used by the concrete UIElement below.
func uiElementAttributeIsKnownUnsupported(
    _ attribute: UIElementAttribute,
    readCache: () -> UIElementCache
) -> Bool {
    if let requested = readCache().transactionAttributes {
        guard requested.contains(attribute) else { return false }
    } else {
        guard !readCache().supportedAttributes.isEmpty else { return false }
    }
    return !readCache().supportedAttributes.contains(attribute)
}

extension UIElement {
    func attributeIsKnownUnsupported(_ attribute: UIElementAttribute) -> Bool {
        uiElementAttributeIsKnownUnsupported(attribute, readCache: { cache })
    }
}

// 0x1007a7d78: read the cache again on the cached-support branch. Protocol
// conformers can return different snapshots; do not eagerly capture one cache.
func uiElementIsAttributeSupported(
    _ attribute: UIElementAttribute,
    readCache: () -> UIElementCache,
    freshSupportedAttributes: () -> Set<UIElementAttribute>
) -> Bool {
    if let requested = readCache().transactionAttributes, !requested.contains(attribute) {
        return freshSupportedAttributes().contains(attribute)
    }
    return readCache().supportedAttributes.contains(attribute)
}

// 0x1007b0308 short-circuits unsupported attributes; 0x1007b029c converts
// errors from the lower-level throwing writability query into false.
func uiElementIsAttributeSupportedAndSettable(
    _ attribute: UIElementAttribute,
    readCache: () -> UIElementCache,
    freshSupportedAttributes: () -> Set<UIElementAttribute>,
    isAttributeSettable: (UIElementAttribute) throws -> Bool
) -> Bool {
    guard uiElementIsAttributeSupported(attribute, readCache: readCache,
        freshSupportedAttributes: freshSupportedAttributes) else { return false }
    return (try? isAttributeSettable(attribute)) == true
}
