import Foundation

// Supplemental action body 0x100793f94. Providers preserve the original lazy
// native reads; this does not replace the still-unrestored full actions getter.
func uiElementDisclosureActions(
    cache: UIElementCache,
    freshSupportedAttributes: () -> Set<UIElementAttribute>,
    isAttributeSettable: (UIElementAttribute) throws -> Bool
) -> [UIElementAction] {
    let disclosing = UIElementAttribute("AXDisclosing")
    let supported: Set<UIElementAttribute>
    if let requested = cache.transactionAttributes, !requested.contains(disclosing) {
        supported = freshSupportedAttributes()
    } else {
        supported = cache.supportedAttributes
    }
    guard supported.contains(disclosing),
          (try? isAttributeSettable(disclosing)) == true else { return [] }
    guard let partial = cache.attributes[disclosing] else { return [.expand] }
    let expanded = try? decodeAXBool(partial.value.value, throwingOnFailure: false)
    return expanded == true ? [.collapse] : [.expand]
}
