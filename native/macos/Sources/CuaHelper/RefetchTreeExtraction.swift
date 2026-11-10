struct RefetchTreeExtraction {
    let context: FocusedUIElementContext
    let previousRevision: UIElementTreeRevision<TransformedUIElement>
    let isAXTreeDiffingEnabled: Bool
    // Native refetch inlines extract with these fixed arguments. In
    // particular it starts without a TreeCache rather than reusing stale AX.
    var treeCache: TransformedUIElement.TreeCache? { nil }
    var rootElement: (any UIElementProtocol)? { nil }
    var contextType: UIElementContextType { .fullUIContext }
    var performAccessibilityEnablement: Bool { true }
    var alwaysIncludeScreenshot: Bool { false }
}

extension RefetchableSkyshotAXTree {
    // 0x100230760 resolves fresh focused context from the CURRENT selection's
    // application, before reading the previous revision for extraction.
    @discardableResult
    func refetchTree(readContext: (ApplicationUIElement) throws -> FocusedUIElementContext,
        extract: (RefetchTreeExtraction) throws -> SystemSelection
    ) throws -> SystemSelection {
        try refetchTree { try extractRefetchSelection(readContext: readContext, extract: extract) }
    }

    // Extraction alone does not publish. Recovery owns publication through its
    // existing refetchTree(extract:) boundary, so nested composition stores once.
    func extractRefetchSelection(
        readContext: (ApplicationUIElement) throws -> FocusedUIElementContext,
        extract: (RefetchTreeExtraction) throws -> SystemSelection
    ) throws -> SystemSelection {
        let context = try readContext(applicationWindow.axApplication)
        let request = RefetchTreeExtraction(context: context,
            previousRevision: systemSelection.windowRevision,
            isAXTreeDiffingEnabled: isAXTreeDiffingEnabled)
        return try extract(request)
    }
}
