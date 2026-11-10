import Foundation

extension UIElementRenderDifference.Change {
    // Change.path0x10063efd4 uses new cursors except for removal.
    var path: IndexPath {
        switch self {
        case .none(_, let new, _), .update(_, let new, _), .insert(_, let new): return new.path
        case .remove(_, let old): return old.path
        }
    }

    struct DepthFirstOrder: Comparable {
        let path: IndexPath
        let operationOrder: Int
        static func < (lhs: Self, rhs: Self) -> Bool {
            switch lhs.path.compare(rhs.path) {
            case .orderedAscending: return true
            case .orderedDescending: return false
            case .orderedSame: return lhs.operationOrder < rhs.operationOrder
            }
        }
    }

    //0x10063f1a4 assigns explicit operation priorities, not enum tag order.
    var depthFirstOrder: DepthFirstOrder {
        let order: Int
        switch self {
        case .none: order = 0
        case .remove: order = 1
        case .insert: order = 2
        case .update: order = 3
        }
        return DepthFirstOrder(path: path, operationOrder: order)
    }
}

extension UIElementRenderDifferenceBuffer {
    //0x1006411dc skips sorting if already marked, then sets the flag even
    // for empty changes. Mutating changes does not implicitly reset it.
    mutating func sortChangesDepthFirst() {
        guard !changesSortedDepthFirst else { return }
        changes.sort { $0.depthFirstOrder < $1.depthFirstOrder }
        changesSortedDepthFirst = true
    }
}
