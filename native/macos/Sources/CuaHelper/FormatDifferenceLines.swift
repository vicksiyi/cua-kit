// Formatting tail of differenceLines. Input ordering is a caller precondition:
// the native caller runs0x100629568 before reaching this stage. Its ordering
// comparator is still being audited; this helper does not substitute one.
func formatPreparedDifferenceLines<Identity: Hashable>(
    ordinary: [UIElementRenderDifference<Identity>.Change],
    summarizedRemovals: [UIElementRenderDifference<Identity>.Change],
    options: UIElementRenderLineOptions
) -> [String] {
    var lines = ordinary.flatMap { $0.lines(indent: "\t", options: options) }
    let ids = summarizedRemovals.flatMap { $0.removedElementIDs() }
    //0x10062b740..74c replaces the empty range0..<0 with one summary.
    if let summary = removedElementIDSummary(ids) { lines.insert(summary, at: 0) }
    return lines
}
