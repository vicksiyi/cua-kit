// Joins recovered extraction stages. Source constructs transformation context
// before transaction.perform0x10023890c, then runs tree/revision work under the
// captured transaction. Transformation/tree implementation remains explicit.
func withSelectionExtractionTransaction<Transformation, Result>(
    context: FocusedUIElementContext, contextType: UIElementContextType,
    treeCache: TransformedUIElement.TreeCache?, rootElement: (any UIElementProtocol)?,
    performAccessibilityEnablement: Bool,
    enable: (ApplicationUIElement, WindowUIElement, UIElementContextType) -> AXEnablementAssertion?,
    readFocus: (ApplicationUIElement) -> UIElement?,
    isWebShaped: (() -> Bool)? = nil,
    makeMonitor: ((ApplicationUIElement) -> UIElementTreeInvalidationMonitor)? = nil,
    makeTransaction: ((any UIElementProtocol, Int) -> UIElementTreeTransaction)? = nil,
    prepareTransformation: () throws -> Transformation,
    work: (any UIElementProtocol, UIElement?, SelectionTreeCapturePreparation, Transformation) throws -> Result
) throws -> Result {
    try withSelectionCaptureContext(context: context, contextType: contextType, rootElement: rootElement,
        performAccessibilityEnablement: performAccessibilityEnablement, enable: enable, readFocus: readFocus) { root, focus in
            let prepared = prepareSelectionTreeCapture(root: root, app: context.app, contextType: contextType,
                treeCache: treeCache, isWebShaped: isWebShaped, makeMonitor: makeMonitor, makeTransaction: makeTransaction)
            let transformation = try prepareTransformation()
            return try prepared.transaction.perform { transactionRoot in
                try work(transactionRoot, focus, prepared, transformation)
            }
        }
}
