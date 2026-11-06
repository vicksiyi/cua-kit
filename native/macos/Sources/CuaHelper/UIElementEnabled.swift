import Foundation

// UIElementProtocol.isEnabled 0x1007ac240..<0x1007ac394 and concrete
// specialization 0x1007902dc..<0x100790408. Read AXEnabled from the
// observation cache only. Missing or undecodable values default to true.
func uiElementIsEnabled(cache: UIElementCache) -> Bool {
    guard let partial = cache.attributes[UIElementAttribute("AXEnabled")] else { return true }
    return (try? decodeAXBool(partial.value.value, throwingOnFailure: false)) ?? true
}

extension UIElement {
    var isEnabled: Bool { uiElementIsEnabled(cache: cache) }

    // Composition of restored getters; provider selection stays at the caller.
    func isFocusable(
        freshSupportedAttributes: () -> Set<UIElementAttribute>,
        isAttributeSettable: (UIElementAttribute) throws -> Bool
    ) -> Bool {
        let focused = UIElementAttribute("AXFocused")
        return uiElementIsFocusable(focusedIsSupported: {
            uiElementIsAttributeSupported(focused, readCache: { cache },
                freshSupportedAttributes: freshSupportedAttributes)
        }, role: { role }, focusedIsSettable: {
            try isAttributeSettable(focused)
        }, isEnabled: { isEnabled })
    }
}
