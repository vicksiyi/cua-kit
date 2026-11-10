// Source0x1007a70b0 walks the complete collection in its original order and
// groups consecutive identities contained in the visible set. Its endpoints
// are inclusive (consumer0x1007a5908 adds1 before slicing).
func uiElementVisibleIndexRanges<Identity: Hashable>(full: [Identity],
    visible: Set<Identity>) -> [ClosedRange<Int>] {
    var result: [ClosedRange<Int>] = []
    var start: Int?
    for (index, identity) in full.enumerated() {
        if visible.contains(identity) {
            if start == nil { start = index }
        } else if let lower = start {
            result.append(lower...(index - 1))
            start = nil
        }
    }
    if let lower = start { result.append(lower...(full.count - 1)) }
    return result
}
