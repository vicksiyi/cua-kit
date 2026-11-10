// Joins the recovered capture/transaction and inner tree stages. The caller's
// continuation remains inside transaction.perform and AX enablement lifetime;
// rendering and revision work must not run after those scopes have unwound.
func withSelectionExtractionTrees<Result>(
    context: FocusedUIElementContext, contextType: UIElementContextType,
    treeCache: TransformedUIElement.TreeCache?, rootElement: (any UIElementProtocol)?,
    performAccessibilityEnablement: Bool, alwaysIncludeScreenshot: Bool = false,
    enable: (ApplicationUIElement, WindowUIElement, UIElementContextType) -> AXEnablementAssertion?,
    readFocus: (ApplicationUIElement) -> UIElement?,
    isWebShaped: (() -> Bool)? = nil,
    makeMonitor: ((ApplicationUIElement) -> UIElementTreeInvalidationMonitor)? = nil,
    makeTransaction: ((any UIElementProtocol, Int) -> UIElementTreeTransaction)? = nil,
    prepareTransformation: () throws -> UIElementTransformationContext,
    reportMissingFocus: (UIElement) -> Void,
    reportSelectionResolutionFailure: () -> Void,
    reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
    reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void,
    work: (SelectionExtractionTrees, SelectionTreeCapturePreparation,
        inout UIElementTransformationContext) throws -> Result
) throws -> Result {
    try withSelectionExtractionTransaction(context: context, contextType: contextType,
        treeCache: treeCache, rootElement: rootElement,
        performAccessibilityEnablement: performAccessibilityEnablement,
        enable: enable, readFocus: readFocus, isWebShaped: isWebShaped,
        makeMonitor: makeMonitor, makeTransaction: makeTransaction,
        prepareTransformation: prepareTransformation,
        work: { root, focus, prepared, transformation in
            var transformation = transformation
            let resolvedFocus = resolveSelectionExtractionFocus(focused: focus,
                app: context.app, window: context.window, reportError: reportError)
            let trees = buildSelectionExtractionTrees(root: root, application: context.app,
                resolvedFocus: resolvedFocus, cachedTree: prepared.treeCache?.tree,
                alwaysIncludeScreenshot: alwaysIncludeScreenshot,
                contextType: contextType, context: &transformation,
                reportMissingFocus: reportMissingFocus,
                reportSelectionResolutionFailure: reportSelectionResolutionFailure,
                reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
                reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents)
            return try work(trees, prepared, &transformation)
        })
}
