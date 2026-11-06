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
