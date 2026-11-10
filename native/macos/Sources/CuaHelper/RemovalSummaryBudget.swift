// differenceLines0x10062ad18..0x10062ad50. Removal changes diverted into
// the summary set a flag at0x10062a274; this check is after ordinary changes.
// It is independent of ignoreDifferenceLineBudget, and does not debit budget.
func checkRemovalSummaryBudget(summarizesRemovedElementIDs: Bool,
    hasSummarizedRemovals: Bool, remaining: Int, fullTreeLineCount: Int,
    onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void
) -> Bool {
    if summarizesRemovedElementIDs && hasSummarizedRemovals && remaining < 1 {
        onLineBudgetExceeded(.removedElementSummary(fullTreeLineCount: fullTreeLineCount))
        return false
    }
    return true
}
