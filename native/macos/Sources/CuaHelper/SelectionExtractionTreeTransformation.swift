func transformSelectionExtractionTrees(_ captured: SelectionExtractionTrees,
    context: inout UIElementTransformationContext, totalLength: inout Int,
    transform: (UIElementTree<TransformedUIElement>, inout UIElementTransformationContext)
        throws -> UIElementTree<TransformedUIElement>
) rethrows -> SelectionExtractionTrees {
    let transformed = try withSelectionTreeURLCompaction(context: &context, totalLength: &totalLength) { context in
        let tree = try transform(captured.tree, &context)
        let focusTree: UIElementTree<TransformedUIElement>?
        if let focus = captured.focusTree { focusTree = try transform(focus, &context) }
        else { focusTree = nil }
        return (tree, focusTree)
    }
    var result = captured
    result.tree = transformed.tree
    result.focusTree = transformed.focusTree
    return result
}

// Source 0x10023c578 and 0x10023c62c independently obtain defaultPipeline.
// Do not cache it once for both calls: the shared pipeline is mutable.
func transformSelectionExtractionTrees(_ captured: SelectionExtractionTrees,
    application: ApplicationUIElement, context: inout UIElementTransformationContext,
    totalLength: inout Int, reportDepthLimit: () -> Void,
    reportLimit: (VisibleChildrenLimitReason) -> Void,
    reportUnknownDateComponents: (UInt) -> Void,
    reportUnknownAttributedStyle: (String) -> Void, reportAttributeError: (Error) -> Void,
    reportUnexpectedNextLine: () -> Void
) -> SelectionExtractionTrees {
    transformSelectionExtractionTrees(captured, context: &context, totalLength: &totalLength) { tree, context in
        tree.transformed(for: application, using: MacUIElementTreeTransformation.defaultPipeline,
            in: &context, reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
            reportUnknownDateComponents: reportUnknownDateComponents,
            reportUnknownAttributedStyle: reportUnknownAttributedStyle,
            reportAttributeError: reportAttributeError, reportUnexpectedNextLine: reportUnexpectedNextLine)
    }
}
