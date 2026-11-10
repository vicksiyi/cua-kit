// Recovered extraction chain. Host diagnostics/AX enablement remain explicit
// so production can bind the original reporting and ownership lifetimes.
func extractSystemSelection(context: FocusedUIElementContext,
    contextType: UIElementContextType,
    treeCache: TransformedUIElement.TreeCache?,
    previousRevision: UIElementTreeRevision<TransformedUIElement>?,
    rootElement: (any UIElementProtocol)?, performAccessibilityEnablement: Bool,
    alwaysIncludeScreenshot: Bool, isAXTreeDiffingEnabled: Bool,
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
    reportUnknownAttributedStyle: (String) -> Void,
    reportUnexpectedNextLine: () -> Void
) throws -> SystemSelection {
    try withSelectionExtractionTrees(context: context, contextType: contextType,
        treeCache: treeCache, rootElement: rootElement,
        performAccessibilityEnablement: performAccessibilityEnablement,
        alwaysIncludeScreenshot: alwaysIncludeScreenshot,
        enable: enable, readFocus: readFocus, isWebShaped: isWebShaped,
        makeMonitor: makeMonitor, makeTransaction: makeTransaction,
        prepareTransformation: prepareTransformation,
        reportMissingFocus: reportMissingFocus,
        reportSelectionResolutionFailure: reportSelectionResolutionFailure,
        reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
        reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents,
        work: { trees, prepared, transformation in
            let info = try finishSelectionExtractionAccessibilityInfo(trees: trees,
                application: context.app, previousRevision: previousRevision,
                isAXTreeDiffingEnabled: isAXTreeDiffingEnabled, context: &transformation,
                reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
                reportUnknownDateComponents: reportUnknownDateComponents,
                reportUnknownAttributedStyle: reportUnknownAttributedStyle,
                reportAttributeError: reportError, reportUnexpectedNextLine: reportUnexpectedNextLine)
            return makeExtractedSystemSelection(applicationWindow: context.applicationWindow,
                accessibilityInfo: info, invalidationMonitor: prepared.invalidationMonitor,
                isWebShaped: prepared.isWebShaped)
        })
}
