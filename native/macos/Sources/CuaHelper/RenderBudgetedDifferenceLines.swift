func renderBudgetedDifferenceLines<Identity: Hashable, Changes: Sequence>(
    _ changes: Changes, options: UIElementRenderLineOptions,
    summarizesRemovedElementIDs: Bool, ignoreDifferenceLineBudget: Bool,
    fullTreeLineCount: Int,
    onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void
) -> [String]? where Changes.Element == UIElementRenderDifference<Identity>.Change {
    guard let prepared = prepareDifferenceLineChanges(changes, options: options,
        summarizesRemovedElementIDs: summarizesRemovedElementIDs,
        ignoreDifferenceLineBudget: ignoreDifferenceLineBudget,
        fullTreeLineCount: fullTreeLineCount, onLineBudgetExceeded: onLineBudgetExceeded)
    else { return nil }
    // Use the same standard Swift stable sort as the original specialization.
    let ordered = prepared.ordinary.sorted { $0.precedesInDifference($1) }
    return formatPreparedDifferenceLines(ordinary: ordered,
        summarizedRemovals: prepared.removals, options: options)
}
