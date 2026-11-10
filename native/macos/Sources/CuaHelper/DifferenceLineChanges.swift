// differenceLines0x10062a194..0x10062ad50: removals summarized separately
// bypass per-change budget consumption. Preserve iterator order and stop
// immediately on failure; do not eagerly materialize the input sequence.
func prepareDifferenceLineChanges<Identity: Hashable, Changes: Sequence>(
    _ changes: Changes, options: UIElementRenderLineOptions,
    summarizesRemovedElementIDs: Bool, ignoreDifferenceLineBudget: Bool,
    fullTreeLineCount: Int,
    onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void
) -> (ordinary: [UIElementRenderDifference<Identity>.Change],
      removals: [UIElementRenderDifference<Identity>.Change])?
where Changes.Element == UIElementRenderDifference<Identity>.Change {
    var ordinary: [Changes.Element] = []
    var removals: [Changes.Element] = []
    var remaining = fullTreeLineCount
    for change in changes {
        if summarizesRemovedElementIDs, case .remove = change {
            removals.append(change)
            continue
        }
        guard change.consumeDifferenceBudget(options: options,
            ignoreDifferenceLineBudget: ignoreDifferenceLineBudget, remaining: &remaining,
            fullTreeLineCount: fullTreeLineCount, onLineBudgetExceeded: onLineBudgetExceeded)
        else { return nil }
        ordinary.append(change)
    }
    guard checkRemovalSummaryBudget(summarizesRemovedElementIDs: summarizesRemovedElementIDs,
        hasSummarizedRemovals: !removals.isEmpty, remaining: remaining,
        fullTreeLineCount: fullTreeLineCount, onLineBudgetExceeded: onLineBudgetExceeded)
    else { return nil }
    return (ordinary, removals)
}
