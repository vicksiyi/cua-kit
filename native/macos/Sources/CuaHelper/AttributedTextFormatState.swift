import OrderedCollections

/// OrderedSet state carried between attributed runs. Names are reconstructed;
/// membership and mutation order follow 0x100772764..<0x100772a88.
struct AttributedTextFormatState {
    private(set) var active: OrderedSet<AttributedTextFormat> = []

    struct Change {
        let previous: OrderedSet<AttributedTextFormat>
        let requested: OrderedSet<AttributedTextFormat>
        let closing: OrderedSet<AttributedTextFormat>
        let opening: OrderedSet<AttributedTextFormat>
    }

    mutating func transition(to formats: [AttributedTextFormat]) -> Change {
        let previous = active
        let requested = OrderedSet(formats)
        let closing = previous.filter { !requested.contains($0) }
        let opening = requested.filter { !previous.contains($0) }
        for format in previous where closing.contains(format) { active.remove(format) }
        for format in opening { active.append(format) }
        // Surviving formats retain their prior order, even if the new run's
        // attribute insertion order differs. Boundary closing is not reversed.
        return Change(previous: previous, requested: requested, closing: closing, opening: opening)
    }
}
