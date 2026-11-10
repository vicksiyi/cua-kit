import DequeModule

// Native descriptors0x1012c9884/0x1012c98a0 and field records0x1013215ac/5e0.
// Codable reconstruction is separate from this storage/traversal restoration.
struct UIElementRenderTreeSnapshot: Hashable {
    let subjectID: String
    let isFocus: Bool
    let renders: [Render]

    struct Render: Hashable {
        let id: Int
        let text: String
        let detailText: String?
        let parentIndex: Int?
    }
}

// Native is an empty struct, not an enum carrying the missing AX identity.
struct UIElementRenderTreeSnapshotError: Error {}

extension UIElementRenderTree {
    //0x100641478..0x10064191c: breadth-first Deque, parents refer to output
    // array indices. Missing rendered elementID throws; duplicate IDs are not
    // rejected by this constructor. Source accessibility identity is not copied.
    func snapshot(subjectID: String) throws(UIElementRenderTreeSnapshotError) -> UIElementRenderTreeSnapshot {
        var pending = Deque(roots.map { (render: $0, parentIndex: Optional<Int>.none) })
        var renders: [UIElementRenderTreeSnapshot.Render] = []
        while let entry = pending.popFirst() {
            let render = entry.render
            guard let id = render.elementID else { throw UIElementRenderTreeSnapshotError() }
            let index = renders.count
            renders.append(.init(id: id, text: render.text, detailText: render.detailText,
                parentIndex: entry.parentIndex))
            pending.append(contentsOf: render.children.map { (render: $0, parentIndex: Optional(index)) })
        }
        return .init(subjectID: subjectID, isFocus: isFocus, renders: renders)
    }
}

extension UIElementTreeRevision {
    //0x100654804 forwards the full render tree and lineageID as subjectID.
    func renderTreeSnapshot() throws -> UIElementRenderTreeSnapshot {
        try renderTree.snapshot(subjectID: lineageID)
    }
}

extension UIElementRenderTreeSnapshot {
    //0x10063cc64 ->0x100645930: rebuild in stored order, retaining a flat
    // reference array for parent indices. Root count selects an initial prefix;
    // the source assumes the breadth-first layout produced by snapshot().
    func renderTree() -> UIElementRenderTree<Int> {
        var nodes: [UIElementRender<Int>] = []
        nodes.reserveCapacity(renders.count)
        var rootCount = 0
        for render in renders {
            let node = UIElementRender(id: render.id, elementID: render.id,
                text: render.text, detailText: render.detailText, sourcePath: nil, children: [])
            nodes.append(node)
            if let parent = render.parentIndex {
                // Preserve native Array bounds behavior; do not normalize a
                // malformed snapshot to a different tree or look up by ID.
                nodes[parent].append(child: node)
            } else {
                rootCount += 1
            }
        }
        return UIElementRenderTree(isFocus: isFocus,
            roots: Array(nodes.dropLast(nodes.count - rootCount)))
    }
}
