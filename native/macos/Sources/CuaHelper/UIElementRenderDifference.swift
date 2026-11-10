import Foundation

// Native difference storage and Change cases. Matching/iteration are composed
// in separate files; buffer and appended revision construction remain separate.
struct UIElementRenderDifference<Identity: Hashable> {
    let oldRender: [UIElementRender<Identity>]
    let newRender: [UIElementRender<Identity>]

    init(oldRender: [UIElementRender<Identity>], newRender: [UIElementRender<Identity>]) {
        self.oldRender = oldRender; self.newRender = newRender
    }
    init(oldTree: UIElementRenderTree<Identity>, newTree: UIElementRenderTree<Identity>) {
        self.init(oldRender: oldTree.roots, newRender: newTree.roots)
    }

    // Field descriptor 0x1013214e8, declaration/tag order preserved.
    enum Change {
        typealias Cursor = UIElementTraversalCursor<UIElementRender<Identity>>
        case none(offset: Int, new: Cursor, old: Cursor)
        case insert(offset: Int, new: Cursor)
        case update(offset: Int, new: Cursor, old: Cursor)
        case remove(offset: Int, old: Cursor)

        // 0x10063f3b8: only none/update inherit, and only if old ID exists.
        // No identity comparison, subtree propagation or nil clearing occurs.
        func inheritElementID() {
            switch self {
            case .none(_, let new, let old), .update(_, let new, let old):
                if let id = old.item.elementID { new.item.elementID = id }
            case .insert, .remove: break
            }
        }
    }
}
