// Inner transform helper0x10023c344 visits transformed full-tree nodes, then
// optional focus-tree nodes. Description text is discarded: its context effects
// register URLs before compaction. Do not replace this with String.count sums.
func registerSelectionTreeURLs(tree: UIElementTree<TransformedUIElement>,
    focusTree: UIElementTree<TransformedUIElement>?, context: inout UIElementTransformationContext
) {
    for element in tree { _ = element.accessibilityDescription(context: &context) }
    if let focusTree {
        for element in focusTree { _ = element.accessibilityDescription(context: &context) }
    }
}
