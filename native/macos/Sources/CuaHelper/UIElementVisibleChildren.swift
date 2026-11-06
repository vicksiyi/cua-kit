import Foundation

// UIElementProtocol.hasCount(for:), 0x1007b0420..<0x1007b0468.
// Missing, zero, negative and throwing counts all mean false.
func uiElementHasCount(_ count: () throws -> Int?) -> Bool {
    ((try? count()) ?? 0) > 0
}

// childrenPreferringVisible, 0x1007a3fd0..<0x1007a409c, with selector
// 0x1007a44f4 and predicate 0x1007a7494. Fresh support is read once even
// when neither visible attribute is supported. A selected empty value does
// not cause a second selection or a fallback to ordinary children.
func uiElementChildrenPreferringVisible<Element>(
    freshSupportedAttributes: () -> Set<UIElementAttribute>,
    count: (UIElementAttribute) throws -> Int?,
    isAttributeSupported: (UIElementAttribute) -> Bool,
    collectionValue: (UIElementAttribute) -> [Element]
) -> [Element] {
    let supported = freshSupportedAttributes()
    for attribute in [UIElementAttribute("AXVisibleRows"), UIElementAttribute("AXVisibleChildren")] {
        if supported.contains(attribute), uiElementHasCount({ try count(attribute) }) {
            return collectionValue(attribute)
        }
    }
    let children = UIElementAttribute("AXChildren")
    guard isAttributeSupported(children) else { return [] }
    return collectionValue(children)
}
