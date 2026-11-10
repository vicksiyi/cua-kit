// Extractor0x10023b500..0x10023b904: measure/compact once, then rewrite
// captured strings only if configuration changed. The compacted configuration
// remains active; the original configuration is not restored for rendering.
func withSelectionTreeURLCompaction(
    context: inout UIElementTransformationContext, totalLength: inout Int,
    transform: (inout UIElementTransformationContext) throws -> (
        tree: UIElementTree<TransformedUIElement>, focusTree: UIElementTree<TransformedUIElement>?)
) rethrows -> (tree: UIElementTree<TransformedUIElement>, focusTree: UIElementTree<TransformedUIElement>?) {
    let original = context.urlShortener.configuration
    // Extractor 0x10023b538 resets URLs accumulated during capture/focus
    // before transforming and registering the trees for this pass.
    context.urlShortener.reset()
    var result = try context.shortenURLsIfNeeded(totalLength: &totalLength) { context in
        let trees = try transform(&context)
        registerSelectionTreeURLs(tree: trees.tree, focusTree: trees.focusTree, context: &context)
        return trees
    }
    if original != context.urlShortener.configuration {
        result.tree.trimURLs(using: &context)
        result.focusTree?.trimURLs(using: &context)
    }
    return result
}
