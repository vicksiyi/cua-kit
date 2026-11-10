// Extractor branch0x10023badc..0x10023bc20. A previous revision is used
// only when diffing is enabled; disabled diffing always starts a new root.
// This runs after tree construction/transformation, which remains separate.
func makeSelectionTreeRevision(
    tree: UIElementTree<TransformedUIElement>, focusTree: UIElementTree<TransformedUIElement>?,
    previousRevision: UIElementTreeRevision<TransformedUIElement>?, isAXTreeDiffingEnabled: Bool,
    context: inout UIElementTransformationContext
) throws -> UIElementTreeRevision<TransformedUIElement> {
    if isAXTreeDiffingEnabled, let previousRevision {
        return try previousRevision.appending(tree: tree, focusTree: focusTree, context: &context)
    }
    return try UIElementTreeRevision.root(tree, focusTree: focusTree, context: &context)
}
