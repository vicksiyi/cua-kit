extension UIElementTree {
    // Source0x100766d78..0x100767018 resolves identity -> tree ID -> stored
    // Item. Stop on the first missing identity/item: a partial selection must
    // not be used as a successful focus result. Keep order and duplicates.
    mutating func itemsForFocusSelection(_ identities: [Element.ID]) -> [Item]? {
        var selected: [Item] = []
        selected.reserveCapacity(identities.count)
        for identity in identities {
            guard let id = id(for: identity), let item = item(for: id) else { return nil }
            selected.append(item)
        }
        return selected
    }
}
