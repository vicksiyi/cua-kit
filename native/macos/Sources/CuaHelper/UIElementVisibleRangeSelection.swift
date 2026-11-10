// Source0x1007a56f4 selects the largest spans, returned in ascending count
// order. Equal-sized spans retain input order; a limited suffix favors later
// ties. For a small limit (< count/10),0x1007a5dec maintains a sorted buffer.
func selectUIElementVisibleRanges(_ ranges: [ClosedRange<Int>], limit: Int) -> [ClosedRange<Int>] {
    precondition(limit >= 0)
    let count = Swift.min(limit, ranges.count)
    guard count > 0 else { return [] }
    if limit >= ranges.count / 10 {
        return Array(ranges.sorted { $0.count < $1.count }.suffix(count))
    }
    var selected = Array(ranges.prefix(count)).sorted { $0.count < $1.count }
    for range in ranges.dropFirst(count) {
        guard range.count >= selected[0].count else { continue }
        // Upper bound preserves order among equal counts.
        var lower = 0
        var upper = selected.count
        while lower < upper {
            let middle = lower + (upper - lower) / 2
            if range.count < selected[middle].count { upper = middle }
            else { lower = middle + 1 }
        }
        selected.insert(range, at: lower)
        selected.removeFirst()
    }
    return selected
}
