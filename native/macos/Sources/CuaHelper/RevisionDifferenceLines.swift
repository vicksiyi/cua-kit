extension UIElementTreeRevision {
    //0x100629630: rebuild snapshots keyed by rendered element ID, rather
    // than reuse the accessibility-identity changes from appended revisions.
    func differenceLines(from baseline: UIElementTreeRevision,
        options: UIElementRenderLineOptions,
        summarizesRemovedElementIDs: Bool, ignoreDifferenceLineBudget: Bool,
        onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void
    ) -> [String]? {
        guard let trees = differenceLineTrees(from: baseline) else { return nil }
        let changes = UIElementRenderDifference(oldTree: trees.baseline, newTree: trees.current)
        return renderBudgetedDifferenceLines(changes, options: options,
            summarizesRemovedElementIDs: summarizesRemovedElementIDs,
            ignoreDifferenceLineBudget: ignoreDifferenceLineBudget,
            fullTreeLineCount: trees.current.differenceFullTreeLineCount(),
            onLineBudgetExceeded: onLineBudgetExceeded)
    }
}
