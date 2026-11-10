import DequeModule

extension UIElementRenderDifference.Change {
    // Caller segment 0x10062a34c..0x10062ac18. Do not clamp negative
    // remaining values or reject using >=: the native branch tests equality
    // with pending work. The callback carries the original full-tree count.
    func consumeDifferenceBudget(options: UIElementRenderLineOptions,
        ignoreDifferenceLineBudget: Bool, remaining: inout Int,
        fullTreeLineCount: Int,
        onLineBudgetExceeded: (AccessibilityDifferenceLineBudgetExceeded) -> Void
    ) -> Bool {
        if ignoreDifferenceLineBudget { return true }
        let seed = differenceBudgetTraversal(options: options)
        var prefix = countDifferenceBudgetPrefix(pending: seed.pending,
            count: seed.count, remaining: remaining)
        if !prefix.pending.isEmpty && prefix.count == remaining {
            onLineBudgetExceeded(.difference(fullTreeLineCount: fullTreeLineCount))
            return false
        }
        // 0x10062a7fc..0x10062abfc continues counting without another
        // budget comparison, including when the initial charge exceeded it.
        while let render = prefix.pending.popLast() {
            prefix.pending.append(contentsOf: render.children)
            prefix.count += 1
        }
        remaining -= prefix.count
        return true
    }

    // 0x10062b8dc: prepare traversal, not the final budget decision. Updates
    // consume one unit directly; insertion/removal normally enqueue the render
    // itself (including its descendants later), not just its children.
    func differenceBudgetTraversal(options: UIElementRenderLineOptions)
        -> (pending: Deque<UIElementRender<Identity>>, count: Int) {
        switch self {
        case .none:
            return ([], 0)
        case .update:
            return ([], 1)
        case .insert(_, let cursor):
            return options.contains(.withoutInsertionSubtree)
                ? ([], 1) : (Deque([cursor.item]), 0)
        case .remove(_, let cursor):
            return options.contains(.withoutRemovalSubtree)
                ? ([], 1) : (Deque([cursor.item]), 0)
        }
    }
}

// 0x10062a380..0x10062a7f8: visit from the back, appending children in
// their stored order. Stop at equality, retaining pending work for the caller's
// exceed check/removal-ID handling. An exactly exhausted empty queue fits.
func countDifferenceBudgetPrefix<Identity>(
    pending: Deque<UIElementRender<Identity>>, count: Int, remaining: Int
) -> (pending: Deque<UIElementRender<Identity>>, count: Int) {
    var pending = pending
    var count = count
    if count < remaining {
        while let render = pending.popLast() {
            pending.append(contentsOf: render.children)
            count += 1
            if count == remaining { break }
        }
    }
    return (pending, count)
}
