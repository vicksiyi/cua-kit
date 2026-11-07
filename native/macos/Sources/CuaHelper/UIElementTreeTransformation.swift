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

extension UIElementTreeTransformation {
    // Common transform entry 0x100657c10. Mac-specific strategies and the
    // production collector are separate consumers of this complete dispatch.
    func transform<Element: MutableAccessibilityNode, Context: AccessibilityRenderingContext>(
        item: UIElementTree<Element>.Item, context: inout Context,
        rebuild: ((inout UIElementTree<Element>, UIElementTree<Element>.Item, inout Context) -> Void)? = nil,
        providerTitle: ((Element.ID) -> String?)? = nil,
        render: (Element, inout Context) throws -> String
    ) -> Result<Element> where Element.Role == Context.Role {
        switch self {
        case .associateTitleUIElements:
            return Self.associateTitleUIElements(item: item, context: &context, rebuild: rebuild, providerTitle: providerTitle)
        case .flattenIntoSelectableAncestor:
            return Self.flattenIntoSelectableAncestor(item: item, context: &context, rebuild: rebuild)
        case .pruneNonDescriptiveSubtrees:
            return Self.pruneNonDescriptiveSubtrees(item: item)
        case .pruneEmptyDisabledElements:
            return Self.pruneEmptyDisabledElements(item: item)
        case .mergeSingleItemGroups:
            return Self.mergeSingleItemGroups(item: item)
        case .flattenRedundantHierarchy:
            return Self.flattenRedundantHierarchy(item: item, context: &context, render: render)
        case .flattenRepetitiveStaticText:
            return Self.flattenRepetitiveStaticText(item: item)
        case .flattenLinksIntoMarkdownText:
            return Self.flattenLinksIntoMarkdownText(item: item, context: &context)
        case .mergeTextOnlySiblings:
            return Self.mergeTextOnlySiblings(item: item, context: &context)
        }
    }
}
