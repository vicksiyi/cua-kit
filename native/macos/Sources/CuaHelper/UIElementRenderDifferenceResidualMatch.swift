import DequeModule

extension UIElementRenderDifference {
    // Residual emission0x100640300..0x1006408c4. The retained identity set
    // is computed separately; nil skips that gate.
    // Removing an old dictionary entry precedes the gate, even on insert.
    static func matchResidualSiblings(old: ArraySlice<Cursor>, new: ArraySlice<Cursor>,
        offset: Int, retainedIdentities: Set<Identity>?, pending: inout Deque<PendingChildren>
    ) -> [Change] {
        var remaining = residualIdentityMap(old, offset: offset)
        return emitResidualMatches(new: new, offset: offset, retainedIdentities: retainedIdentities,
            remaining: &remaining, pending: &pending)
    }

    static func emitResidualMatches(new: ArraySlice<Cursor>, offset: Int,
        retainedIdentities: Set<Identity>?, remaining: inout [Identity: IndexedCursor],
        pending: inout Deque<PendingChildren>
    ) -> [Change] {
        var changes: [Change] = []
        for (index, cursor) in new.enumerated() {
            let position = offset + index
            if let previous = remaining.removeValue(forKey: cursor.item.id),
               retainedIdentities?.contains(cursor.item.id) ?? true {
                changes.append(matchedChange(offset: position, new: cursor, old: previous.cursor, pending: &pending))
            } else {
                changes.append(.insert(offset: position, new: cursor))
            }
        }
        // Native iterates Dictionary.Values, without sorting removals by offset.
        for previous in remaining.values {
            changes.append(.remove(offset: previous.offset, old: previous.cursor))
        }
        return changes
    }
}
