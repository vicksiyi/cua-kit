import Foundation

// Supplemental action body 0x100793f94. Providers preserve the original lazy
// native reads; this does not replace the still-unrestored full actions getter.
func uiElementDisclosureActions(
    cache: UIElementCache,
    freshSupportedAttributes: () -> Set<UIElementAttribute>,
    isAttributeSettable: (UIElementAttribute) throws -> Bool
) -> [UIElementAction] {
    let disclosing = UIElementAttribute("AXDisclosing")
    guard uiElementIsAttributeSupportedAndSettable(disclosing, readCache: { cache },
        freshSupportedAttributes: freshSupportedAttributes,
        isAttributeSettable: isAttributeSettable) else { return [] }
    return uiElementIsDisclosing(cache: cache) ? [.collapse] : [.expand]
}
