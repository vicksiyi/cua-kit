// Text classification helper 0x10065cb8c, used by mergeTextOnlySiblings.
// The complete grouping/mutation rule is separate; this helper classifies a
// node without examining its children, actions, focusability or subset.
func siblingMergeText<Element: MutableAccessibilityNode, Context: AccessibilityRenderingContext>(
    element: Element, context: inout Context
) -> (text: TransformedUIString, role: Element.Role)? where Element.Role == Context.Role {
    let role = element.role
    if role == .staticText, let value = element.stringValue {
        return (TransformedUIString(value), role)
    }
    guard role == .link, context.type == .informationalContext else { return nil }
    guard let url = element.url else { return (TransformedUIString(""), role) }
    var interpolation = TransformedUIString.StringInterpolation(literalCapacity: 0, interpolationCount: 1)
    interpolation.appendMarkdownLink(url: url, role: role,
        stringValue: element.stringValue, title: element.title,
        description: element.description, context: &context)
    return (TransformedUIString(stringInterpolation: interpolation), role)
}
