import Foundation

// Native cursor storage (item, path), with depth getter 0x10064b194.
// Traversable protocol constraints and traversal helpers are restored separately.
struct UIElementTraversalCursor<Item> {
    let item: Item
    let path: IndexPath
    var depth: Int { path.count - 1 }
}

extension UIElementTraversalCursor {
    func childCursors<Identity>() -> [UIElementTraversalCursor<Item>]
        where Item == UIElementRender<Identity> {
        item.children.enumerated().map { index, child in
            UIElementTraversalCursor(item: child, path: path.appending(index))
        }
    }
}
