import Foundation

// 0x1007b0148: read isDisclosable first; unsupported disclosure is a no-op.
// Both synthetic actions enter this same toggle, not separate true/false writes.
// Getters are injected until the full UIElementProtocol witness dispatch exists.
func uiElementToggleDisclosure(
    isDisclosable: () -> Bool,
    isDisclosing: () -> Bool,
    setDisclosing: (Bool) throws -> Void
) rethrows {
    guard isDisclosable() else { return }
    try setDisclosing(!isDisclosing())
}

// isDisclosing uses only the cached AXDisclosing partial value. Missing values,
// failed decoding, and mismatches are false; it does not refresh the attribute.
func uiElementIsDisclosing(cache: UIElementCache) -> Bool {
    guard let partial = cache.attributes[UIElementAttribute("AXDisclosing")] else { return false }
    return (try? decodeAXBool(partial.value.value, throwingOnFailure: false)) == true
}

// Concrete immutable UIElement composition. System/provider writes remain
// supplied by the caller until the original encoded-value setter is restored.
extension UIElement {
    var isDisclosing: Bool { uiElementIsDisclosing(cache: cache) }

    func toggleDisclosure(
        freshSupportedAttributes: () -> Set<UIElementAttribute>,
        isAttributeSettable: (UIElementAttribute) throws -> Bool,
        setDisclosing: (Bool) throws -> Void
    ) rethrows {
        try uiElementToggleDisclosure(isDisclosable: {
            uiElementIsAttributeSupportedAndSettable(UIElementAttribute("AXDisclosing"),
                readCache: { cache }, freshSupportedAttributes: freshSupportedAttributes,
                isAttributeSettable: isAttributeSettable)
        }, isDisclosing: { uiElementIsDisclosing(cache: cache) }, setDisclosing: setDisclosing)
    }
}
