import DequeModule

// differenceLines prefix0x1006298a8..0x100629950. Snapshot failures mean
// diff unavailable (nil), not a successful empty diff. Rebuild the baseline
// before obtaining the current snapshot; no lineage-string check is invented.
func prepareDifferenceLineTrees<Snapshot, Tree>(
    baselineSnapshot: () throws -> Snapshot,
    currentSnapshot: () throws -> Snapshot,
    rebuild: (Snapshot) -> Tree
) -> (baseline: Tree, current: Tree)? {
    guard let baseline = try? baselineSnapshot() else { return nil }
    let oldTree = rebuild(baseline)
    guard let current = try? currentSnapshot() else { return nil }
    return (oldTree, rebuild(current))
}

extension UIElementTreeRevision {
    // Full-tree snapshots only; focus trees are handled by the surrounding
    // description separately. RevisionDifferenceLines composes later stages.
    func differenceLineTrees(from baseline: UIElementTreeRevision)
        -> (baseline: UIElementRenderTree<Int>, current: UIElementRenderTree<Int>)? {
        prepareDifferenceLineTrees(baselineSnapshot: { try baseline.renderTreeSnapshot() },
            currentSnapshot: { try self.renderTreeSnapshot() }, rebuild: { $0.renderTree() })
    }
}

extension UIElementRenderTree {
    // Counter in differenceLines0x100629a20..0x100629fa4. It counts render
    // nodes, including empty/multiline text, not newline characters or bytes.
    // This alone is not the later difference/removal budget decision.
    func differenceFullTreeLineCount() -> Int {
        var pending = Deque(roots)
        var count = 0
        while let render = pending.popFirst() {
            pending.append(contentsOf: render.children)
            count += 1
        }
        return count
    }
}
