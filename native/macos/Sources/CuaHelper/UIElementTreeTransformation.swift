// Original descriptor 0x1012c9cc8, declaration order preserved. Individual
// transform policy implementations remain separate from this configuration.
enum UIElementTreeTransformation: Hashable {
    case associateTitleUIElements
    case flattenIntoSelectableAncestor
    case pruneNonDescriptiveSubtrees
    case pruneEmptyDisabledElements
    case mergeSingleItemGroups
    case flattenRedundantHierarchy
    case flattenRepetitiveStaticText
    case flattenLinksIntoMarkdownText
    case mergeTextOnlySiblings

    // Mutable source static, initialized at 0x10065c030 from 0x10156b860.
    static var defaultPipeline: [Self] = [
        .associateTitleUIElements, .flattenIntoSelectableAncestor,
        .pruneNonDescriptiveSubtrees, .pruneEmptyDisabledElements,
        .mergeSingleItemGroups, .flattenRedundantHierarchy,
        .flattenRepetitiveStaticText, .flattenLinksIntoMarkdownText,
        .mergeTextOnlySiblings,
    ]
    enum Result<Element: AccessibilityNode> {
        case transformed(UIElementTree<Element>.Item)
        case replaced(UIElementTree<Element>.Item)
        case removed
        case unchanged
    }
}

extension UIElementTree where Element: MutableAccessibilityNode {
    // 0x100651398: transform each item, then its retained subtree. Rebuild
    // derived caches via init and preserve the original focusedElement capture.
    func transformed<Transformation, Context>(
        using transformations: [Transformation], in context: inout Context,
        apply: (Transformation, Item, inout Context) -> UIElementTreeTransformation.Result<Element>
    ) -> Self {
        let transformedItems = items.compactMap { original -> Item? in
            guard var item = applying(transformations, to: original, in: &context, apply: apply) else { return nil }
            item.subtree = item.subtree.transformed(using: transformations, in: &context, apply: apply)
            return item
        }
        return Self(items: transformedItems, focusedElement: focusedElement)
    }

    // 0x100651728: transformed continues with the next rule; replaced restarts
    // the full rule sequence on the replacement; removed drops the subtree.
    private func applying<Transformation, Context>(
        _ transformations: [Transformation], to original: Item, in context: inout Context,
        apply: (Transformation, Item, inout Context) -> UIElementTreeTransformation.Result<Element>
    ) -> Item? {
        var item = original
        for transformation in transformations {
            switch apply(transformation, item, &context) {
            case .unchanged: continue
            case .transformed(let changed): item = changed
            case .replaced(let replacement):
                return applying(transformations, to: replacement, in: &context, apply: apply)
            case .removed: return nil
            }
        }
        return item
    }
}
