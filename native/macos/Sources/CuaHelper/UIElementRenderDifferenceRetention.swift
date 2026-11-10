extension UIElementRenderDifference {
    // Preflight0x100637a10..0x100637c48 skips identities without an old
    // offset. Existing offsets must strictly increase from the sentinel -1.
    // The slow branch restores suffix lengths and earliest feasible selection.
    static func retainedIdentities(for identities: [Identity],
        old: [Identity: IndexedCursor],
        unordered: ([Identity], [Identity: IndexedCursor]) -> Set<Identity> = unorderedRetainedIdentities
    ) -> Set<Identity>? {
        var previous = -1
        for identity in identities {
            guard let position = old[identity]?.offset else { continue }
            guard previous < position else { return unordered(identities, old) }
            previous = position
        }
        //0x100637920 returns nil directly when the ordering preflight passes.
        return nil
    }
}
