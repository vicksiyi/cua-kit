enum SelectionDescriptionTreeLines: Equatable {
    case fullTree([String])
    case difference([String])
}

//0x100239004 and0x10023902c distinguish unavailable diff from empty diff.
// Only unavailable diff falls back to full tree; keep full rendering lazy.
func selectionDescriptionTreeLines(readDifference: () -> [String]?,
    readFullTree: () -> [String]) -> SelectionDescriptionTreeLines {
    if let lines = readDifference() { return .difference(lines) }
    return .fullTree(readFullTree())
}

extension UIElementTreeRevision {
    func descriptionTreeLines(mode: SystemSelection.LLMDescriptionMode,
        lineOptions: UIElementRenderLineOptions, summarizesRemovedElementIDs: Bool,
        onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void
    ) -> SelectionDescriptionTreeLines {
        selectionDescriptionTreeLines(readDifference: {
            guard let baseline = descriptionDifferenceBaseline(for: mode) else { return nil }
            return differenceLines(from: baseline, options: lineOptions,
                summarizesRemovedElementIDs: summarizesRemovedElementIDs,
                ignoreDifferenceLineBudget: false, onLineBudgetExceeded: onLineBudgetExceeded)
        }, readFullTree: { renderTree.lines(indent: "\t", options: lineOptions) })
    }
}
