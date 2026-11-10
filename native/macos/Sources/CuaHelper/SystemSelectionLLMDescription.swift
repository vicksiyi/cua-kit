extension SystemSelection {
    //0x100238b88..0x1002394a0. Feature reads retain their source timing:
    // none for full mode, one before diff selection, another for nonempty
    // diff prose. Final bundle lookup occurs after presentation construction.
    func llmDescription(_ mode: LLMDescriptionMode, lineOptions: UIElementRenderLineOptions,
        onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void,
        readSummaryFeature: () -> Bool = { NativeDescriptionFeatureGate.summarizesRemovedElementIDs() },
        readWindowTitle: (ApplicationWindow) -> String? = { $0.title },
        readApplicationName: (ApplicationWindow) -> String? = { $0.appName },
        readSelectedText: (TransformedUIElement) -> String? = { $0.selectedText },
        readBundleIdentifier: (ApplicationWindow) -> String? = { $0.axWindow.axElement.bundleIdentifier }
    ) -> String {
        let title = readWindowTitle(applicationWindow)
        let name = readApplicationName(applicationWindow)
        let focus = descriptionFocus(lineOptions: lineOptions, readSelectedText: readSelectedText)
        let summary: Bool
        switch mode {
        case .fullTree: summary = false
        case .difference: summary = readSummaryFeature()
        }
        let tree = windowRevision.descriptionTreeLines(mode: mode, lineOptions: lineOptions,
            summarizesRemovedElementIDs: summary, onLineBudgetExceeded: onLineBudgetExceeded)
        var legendSummary = summary
        if case .difference(let lines) = tree, !lines.isEmpty { legendSummary = readSummaryFeature() }
        let presentation = selectionDescriptionPresentation(windowTitle: title, applicationName: name,
            mode: mode, tree: tree, focus: focus, summarizesRemovedElementIDs: legendSummary)
        return selectionDescriptionText(presentation, bundleIdentifier: readBundleIdentifier(applicationWindow))
    }
}
