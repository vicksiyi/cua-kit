extension UIElementTree where Element == TransformedUIElement {
    // Native0x10075b050 updates stored transformed text before descending.
    // Informational attributed text preserves its original value string.
    // focusedElement is a separate captured value and is not rewritten here.
    mutating func trimURLs(using context: inout UIElementTransformationContext) {
        for index in items.indices {
            let changed = items[index].element.transformedString?.trimURLs(context: &context) ?? false
            if changed,
               !(context.type == .informationalContext && items[index].element.attributedString != nil),
               let text = items[index].element.transformedString {
                items[index].element.value = text.description
            }
            items[index].subtree.trimURLs(using: &context)
        }
    }
}
