extension UIElementRenderDifference {
    //0x100637e50 computes suffix lengths by reverse iteration and lower-bound
    // insertion of negated offsets.0x1006381a4 greedily picks earliest feasible
    // identities, preserving strict offset growth and the remaining length.
    static func unorderedRetainedIdentities(_ identities: [Identity],
        old: [Identity: IndexedCursor]
    ) -> Set<Identity> {
        let mapped = identities.compactMap { identity -> (identity: Identity, offset: Int)? in
            old[identity].map { (identity, $0.offset) }
        }
        var lengths = Array(repeating: 0, count: mapped.count)
        var tails: [Int] = []
        for index in mapped.indices.reversed() {
            let value = -mapped[index].offset
            var low = 0
            var high = tails.count
            while low < high {
                let middle = (low + high) / 2
                if tails[middle] < value { low = middle + 1 }
                else { high = middle }
            }
            lengths[index] = low + 1
            if low == tails.count { tails.append(value) }
            else { tails[low] = value }
        }
        var remaining = tails.count
        var previous = -1
        var result: Set<Identity> = []
        result.reserveCapacity(remaining)
        for (index, item) in mapped.enumerated() {
            guard remaining > 0, item.offset > previous, lengths[index] >= remaining else { continue }
            result.insert(item.identity)
            previous = item.offset
            remaining -= 1
        }
        return result
    }
}
