// SystemSelection.llmDescription presentation composition. Metadata nil uses
// Unknown; present-empty strings remain empty. Final app-specific notes and
// feature configuration are handled outside this pure composition stage.
func selectionDescriptionPresentation(windowTitle: String?, applicationName: String?,
    mode: SystemSelection.LLMDescriptionMode, tree: SelectionDescriptionTreeLines,
    focus: SelectionDescriptionFocus, summarizesRemovedElementIDs: Bool
) -> AccessibilityTreePresentation {
    let context = focus.presentationContext
    let title = windowTitle ?? "Unknown"
    switch tree {
    case .fullTree(let lines):
        return AccessibilityTreePresentation(windowTitle: title, applicationName: applicationName ?? "Unknown",
            treeLines: lines, focusedElement: context.focusedElement,
            selectedText: context.selectedText, selectedElements: context.selectedElements)
    case .difference(let lines):
        guard case .difference(let baseline) = mode else {
            preconditionFailure("Full-tree mode cannot produce difference lines")
        }
        return .difference(windowTitle: title, from: baseline, lines: lines,
            summarizesRemovedElementIDs: summarizesRemovedElementIDs,
            focusedElement: context.focusedElement, selectedText: context.selectedText,
            selectedElements: context.selectedElements)
    }
}
