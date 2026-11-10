import CoreGraphics

// Native0x1007a1ae0..0x1007a3308: LIFO traversal starts with children,
// excludes scrollbars, deduplicates nodes, and stops descending into nested
// scrolling containers after incorporating their own frame.
func uiElementScrollContentFrame<Node: Hashable>(of root: Node,
    role: (Node) -> UIElementRole, frame: (Node) -> CGRect?,
    children: (Node) -> [Node], hasPageScrollAction: (Node) -> Bool
) -> CGRect {
    uiElementScrollContentFrame(children: children(root), role: role, frame: frame,
        children: children, hasPageScrollAction: hasPageScrollAction)
}

// Root need not be the same concrete type as the captured child nodes. Only
// descendants participate in deduplication in the recovered algorithm.
func uiElementScrollContentFrame<Node: Hashable>(children initialChildren: [Node],
    role: (Node) -> UIElementRole, frame: (Node) -> CGRect?,
    children: (Node) -> [Node], hasPageScrollAction: (Node) -> Bool
) -> CGRect {
    var pending = initialChildren
    var visited = Set<Node>()
    var bounds = CGRect.null
    while let node = pending.popLast() {
        if role(node) == .scrollBar { continue }
        guard visited.insert(node).inserted else { continue }
        if let frame = frame(node), !frame.isEmpty { bounds = bounds.union(frame) }
        if role(node) == .scrollArea { continue }
        if role(node) == .group && hasPageScrollAction(node) { continue }
        pending.append(contentsOf: children(node))
    }
    return bounds
}

extension UIElementProtocol {
    func scrollContentFrame(reportError: (Error) -> Void) -> CGRect {
        uiElementScrollContentFrame(children: childrenValue(reportError: reportError), role: { $0.role },
            frame: { $0.frameValue(reportError: reportError) },
            children: { $0.childrenValue(reportError: reportError) },
            hasPageScrollAction: { $0.hasScrollAction(in: .provider, reportError: reportError) })
    }
}
