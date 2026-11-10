// Inner extractor's post-capture chain: transform both trees under URL
// accounting, then render/root-or-append the revision. Invoke this from the
// withSelectionExtractionTrees continuation to retain transaction/enablement.
func finishSelectionExtractionAccessibilityInfo(trees: SelectionExtractionTrees,
    application: ApplicationUIElement,
    previousRevision: UIElementTreeRevision<TransformedUIElement>?,
    isAXTreeDiffingEnabled: Bool, context: inout UIElementTransformationContext,
    reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
    reportUnknownDateComponents: (UInt) -> Void,
    reportUnknownAttributedStyle: (String) -> Void, reportAttributeError: (Error) -> Void,
    reportUnexpectedNextLine: () -> Void
) throws -> FocusedUIElementAccessibilityInfo {
    var totalLength = 0
    let transformed = transformSelectionExtractionTrees(trees, application: application,
        context: &context, totalLength: &totalLength, reportDepthLimit: reportDepthLimit,
        reportLimit: reportLimit, reportUnknownDateComponents: reportUnknownDateComponents,
        reportUnknownAttributedStyle: reportUnknownAttributedStyle,
        reportAttributeError: reportAttributeError, reportUnexpectedNextLine: reportUnexpectedNextLine)
    return try makeSelectionAccessibilityInfo(trees: transformed,
        previousRevision: previousRevision, isAXTreeDiffingEnabled: isAXTreeDiffingEnabled,
        context: &context)
}
