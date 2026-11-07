extension UIElementTreeTransformation {
    // Tag 7, 0x10065856c and 0x10065a7ec..0x10065aad8. Despite the enum
    // name, this branch interpolates the URL alone, not [node title](URL).
    static func flattenLinksIntoMarkdownText<Element: MutableAccessibilityNode, Context: AccessibilityRenderingContext>(
        item original: UIElementTree<Element>.Item, context: inout Context
    ) -> Result<Element> where Element.Role == Context.Role {
        guard original.element.role == .link, let url = original.element.url else { return .unchanged }
        var interpolation = TransformedUIString.StringInterpolation(literalCapacity: 0, interpolationCount: 1)
        interpolation.appendLiteral("")
        interpolation.appendInterpolation(url, role: original.element.role, context: &context)
        interpolation.appendLiteral("")
        let text = TransformedUIString(stringInterpolation: interpolation)
        // Check rendered text, not structural span emptiness. URL shortening
        // already mutated context and those changes survive an unchanged result.
        guard !text.description.isEmpty else { return .unchanged }
        var item = original
        item.element.role = .staticText
        item.element.roleDescription = "link"
        item.element.transformedString = text
        item.element.value = text.description
        item.element.url = nil
        item.subtree.items.removeAll(keepingCapacity: false)
        return .transformed(item)
    }
}
