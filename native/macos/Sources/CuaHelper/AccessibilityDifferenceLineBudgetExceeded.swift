// Recovered from the installed ComputerUseCore Swift enum field metadata.
// See reconstruction/desktop-diff-evidence.json for the pinned artifact and
// descriptor addresses. The diff engine is not restored or wired up yet.
enum AccessibilityDifferenceLineBudgetExceeded: Equatable {
    case difference(fullTreeLineCount: Int)
    case removedElementSummary(fullTreeLineCount: Int)
}
