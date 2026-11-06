import CoreGraphics

// 0x1007a0654: repeated role getters are intentionally lazy, not captured once.
func uiElementIsClippingBoundary(role: () -> UIElementRole) -> Bool {
    role() == .window || role() == .sheet || role() == .menu || role() == .popover
}

// 0x1007a04d4 and 0x1007a088c: scroll containers OR terminal boundaries.
func uiElementClipsChildren(role: () -> UIElementRole, hasScrollAction: () -> Bool) -> Bool {
    if role() == .scrollArea { return true }
    if role() == .group && hasScrollAction() { return true }
    return uiElementIsClippingBoundary(role: role)
}

// 0x10079ffb8..<0x1007a03f8. This walk starts at self and is distinct from
// parentChain(maxDepth:300): there is no depth cap or lookahead in this path.
func uiElementClippingFrame<Node>(
    of element: Node,
    uncached: Bool,
    role: (Node) -> UIElementRole,
    frameAttribute: (Node, Bool) -> CGRect?,
    hasScrollAction: (Node) -> Bool,
    parent: (Node, Bool) -> Node?
) -> CGRect? {
    var clipped = CGRect.infinite
    var current: Node? = element
    while let node = current {
        if role(node) == .application { break }
        // Even a non-clipping node must have a frame in the original path.
        guard let frame = frameAttribute(node, uncached) else { return nil }
        if uiElementClipsChildren(role: { role(node) }, hasScrollAction: { hasScrollAction(node) }) {
            clipped = clipped.intersection(frame)
            if clipped.isEmpty || clipped.isNull { return nil }
        }
        if uiElementIsClippingBoundary(role: { role(node) }) { break }
        current = parent(node, uncached)
    }
    return clipped == CGRect.infinite ? nil : clipped
}
