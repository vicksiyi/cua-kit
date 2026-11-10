// Source0x1007a46fc chooses the full collection corresponding to the supplied
// visibility attribute. This is attribute equality, unlike preferredVisibleAttribute,
// which selects an attribute by support and count.
func uiElementFullAttributeForVisibleSubset(_ attribute: UIElementAttribute) -> UIElementAttribute? {
    if attribute == UIElementAttribute("AXVisibleRows") { return UIElementAttribute("AXRows") }
    if attribute == UIElementAttribute("AXVisibleChildren") { return UIElementAttribute("AXChildren") }
    return nil
}

// Final fallback0x1007a53c0..0x1007a5438. Preserve lazy reads and nil/empty
// distinctions: only a strictly larger, positive collection below500 is read.
func uiElementVisibleSubsetFallback<Result>(using attribute: UIElementAttribute, visibleCount: Int,
    count: (UIElementAttribute) throws -> Int?,
    read: (UIElementAttribute) -> Result?
) -> Result? {
    guard let attribute = uiElementFullAttributeForVisibleSubset(attribute),
          let fullCount = try? count(attribute), fullCount > 0, fullCount < 500,
          visibleCount < fullCount else { return nil }
    return read(attribute)
}
