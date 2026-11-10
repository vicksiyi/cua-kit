// Helper0x10062cac8: Array -> Set<Int> -> sorted array -> contiguous ranges.
// Uses Swift's existing Set/sort, not a new deduplication implementation.
func removedElementIDRanges(_ ids: [Int]) -> String {
    let sorted = Set(ids).sorted()
    guard let first = sorted.first else { return "" }
    var start = first
    var end = first
    var parts: [String] = []
    for id in sorted.dropFirst() {
        if id == end + 1 {
            end = id
        } else {
            parts.append(start == end ? String(start) : "\(start)-\(end)")
            start = id
            end = id
        }
    }
    parts.append(start == end ? String(start) : "\(start)-\(end)")
    return parts.joined(separator: ", ")
}

// differenceLines0x10062b6c8..0x10062b74c only appends a summary for a
// nonempty removed-ID collection. This is not the removal budget decision.
func removedElementIDSummary(_ ids: [Int]) -> String? {
    guard !ids.isEmpty else { return nil }
    return "Removed element IDs: " + removedElementIDRanges(ids)
}
