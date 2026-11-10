extension UIElementRenderDifference {
    typealias IndexedCursor = (offset: Int, cursor: Cursor)

    // Native0x100645420..0x1006457ac enumerates a residual ArraySlice,
    // adds the consumed-prefix offset, and assigns by identity. Duplicate
    // identities overwrite earlier entries; they do not trap or accumulate.
    static func residualIdentityMap(_ cursors: ArraySlice<Cursor>, offset: Int) -> [Identity: IndexedCursor] {
        var result: [Identity: IndexedCursor] = [:]
        result.reserveCapacity(cursors.count)
        for (index, cursor) in cursors.enumerated() {
            result[cursor.item.id] = (offset: offset + index, cursor: cursor)
        }
        return result
    }
}
