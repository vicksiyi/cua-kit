import DequeModule

extension UIElementRenderDifference {
    // Prefix of helper0x10063f960, loop0x10063fd58..0x10063feb4.
    // Stop on the first unequal identity; text changes still consume the pair.
    // The remaining dictionary/matching branches are deliberately separate.
    static func matchSiblingPrefix(old: [Cursor], new: [Cursor],
        pending: inout Deque<PendingChildren>
    ) -> (consumed: Int, changes: [Change]) {
        var changes: [Change] = []
        changes.reserveCapacity(Swift.max(old.count, new.count))
        var index = 0
        while index < Swift.min(old.count, new.count) {
            guard old[index].item.id == new[index].item.id else { break }
            changes.append(matchedChange(offset: index, new: new[index], old: old[index], pending: &pending))
            index += 1
        }
        return (index, changes)
    }
}
