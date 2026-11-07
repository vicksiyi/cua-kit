import Foundation

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

extension UIElementTreeTransformation {
    // Tag 8, 0x10065a5c8 -> 0x10065aaec; reverse range mutation at
    // 0x10065b1f0. Candidate runs are captured before changing any child.
    static func mergeTextOnlySiblings<Element: MutableAccessibilityNode, Context: AccessibilityRenderingContext>(
        item original: UIElementTree<Element>.Item, context: inout Context
    ) -> Result<Element> where Element.Role == Context.Role {
        guard !original.element.isSelectable, !original.element.isFocusable else { return .unchanged }
        var candidates: [Int: (text: TransformedUIString, role: Element.Role)] = [:]
        var ranges: [Range<Int>] = []
        var start: Int?
        for index in original.children.indices {
            if let candidate = siblingMergeText(element: original.children[index].element, context: &context) {
                candidates[index] = candidate
                if start == nil { start = index }
            } else if let lower = start {
                ranges.append(lower..<index)
                start = nil
            }
        }
        if let start { ranges.append(start..<original.children.count) }
        guard !ranges.isEmpty else { return .unchanged }
        var item = original
        for range in ranges.filter({ $0.count > 1 }).reversed() {
            guard let candidate = candidates[range.lowerBound],
                  let flattened = item.subtree.items[range.lowerBound].element.flattenedRole else { continue }
            var replacement = item.subtree.items[range.lowerBound]
            replacement.element.role = candidate.role
            replacement.element.roleDescription = flattened.targetDescription
            replacement.subtree.items.removeAll(keepingCapacity: false)
            // Test trimmed descriptions only to discard whitespace-only inputs;
            // retain the original structured text and its surrounding whitespace.
            let texts = range.compactMap { candidates[$0]?.text }.filter {
                !$0.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            // 0x100657778 has the same structural-empty and plain-tail join
            // semantics as the restored TransformedUIString joined operation.
            let merged = texts.joined(separator: flattened.separator)
            replacement.element.transformedString = merged
            if replacement.element.stringValue != nil {
                replacement.element.value = merged.description
            } else {
                replacement.element.description = merged.description
            }
            item.subtree.items.replaceSubrange(range, with: [replacement])
        }
        // Any candidate run reaches transformed, even if all are singletons
        // or lack a flattened-role descriptor. No candidates yields unchanged.
        return .transformed(item)
    }
}
