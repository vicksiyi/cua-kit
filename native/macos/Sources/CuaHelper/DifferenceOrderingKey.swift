import Foundation

extension UIElementRenderDifference.Change {
    // Native sorting specialization0x100631e10..0x100632024 constructs
    // a path/rank pair. Rank differs from enum tag order; offset is not used.
    var differenceOrderingKey: (path: IndexPath, rank: Int) {
        let order = depthFirstOrder
        return (order.path, order.operationOrder)
    }

    //0x100632278 compares candidate path with preceding path; ascending
    // paths shift left. Equal paths compare ranks with unsigned less-than.
    func precedesInDifference(_ other: Self) -> Bool {
        depthFirstOrder < other.depthFirstOrder
    }
}
