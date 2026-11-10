extension SystemSelection {
    // Complete presentation stage; final app-specific suffix and feature
    // owner are bound by the surrounding llmDescription caller separately.
    func descriptionPresentation(mode: LLMDescriptionMode,
        lineOptions: UIElementRenderLineOptions, summarizesRemovedElementIDs: Bool,
        onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void,
        readWindowTitle: (ApplicationWindow) -> String? = { $0.title },
        readApplicationName: (ApplicationWindow) -> String? = { $0.appName },
        readSelectedText: (TransformedUIElement) -> String? = { $0.selectedText }
    ) -> AccessibilityTreePresentation {
        let title = readWindowTitle(applicationWindow)
        let name = readApplicationName(applicationWindow)
        let focus = descriptionFocus(lineOptions: lineOptions, readSelectedText: readSelectedText)
        let tree = windowRevision.descriptionTreeLines(mode: mode, lineOptions: lineOptions,
            summarizesRemovedElementIDs: summarizesRemovedElementIDs,
            onLineBudgetExceeded: onLineBudgetExceeded)
        return selectionDescriptionPresentation(windowTitle: title, applicationName: name,
            mode: mode, tree: tree, focus: focus,
            summarizesRemovedElementIDs: summarizesRemovedElementIDs)
    }
}
