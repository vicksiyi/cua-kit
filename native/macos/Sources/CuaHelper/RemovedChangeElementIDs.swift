import DequeModule

extension UIElementRenderDifference.Change {
    // Summary path0x10062b194..0x10062b644: all removed descendants are
    // considered even with withoutRemovalSubtree. Preserve duplicates here;
    // the later range formatter performs Set conversion and sorting.
    func removedElementIDs() -> [Int] {
        guard case .remove(_, let old) = self else { return [] }
        var pending = Deque([old.item])
        var result: [Int] = []
        while let render = pending.popLast() {
            pending.append(contentsOf: render.children)
            if let id = render.elementID { result.append(id) }
        }
        return result
    }
}
