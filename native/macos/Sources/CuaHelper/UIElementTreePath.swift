import Foundation

extension UIElementTree {
    // 0x10064e63c: empty paths and an index outside items.indices return nil.
    // Consume one component, returning that item or recurse into its subtree.
    // Paths address stored item positions, not external IDs or subset offsets.
    func item(for path: IndexPath) -> Item? {
        guard let index = path.first, items.indices.contains(index) else { return nil }
        let item = items[index]
        let remainder = IndexPath(indexes: path.dropFirst())
        return remainder.isEmpty ? item : item.subtree.item(for: remainder)
    }
    // The two original at: entry points are direct aliases of their for: forms.
    func item(at path: IndexPath) -> Item? { item(for: path) }
    func element(for path: IndexPath) -> Element? { item(for: path)?.element }
    func element(at path: IndexPath) -> Element? { element(for: path) }
}
