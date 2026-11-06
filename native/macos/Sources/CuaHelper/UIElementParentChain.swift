// UIElementProtocol.parentChain(maxDepth:includingSelf:), 0x1007a7fa4,
// next closure 0x1007b704c. Original default depth getter returns 300.
// Node stands for the original protocol existential; parent resolution remains
// explicit until that complete protocol and provider layer are restored.
func uiElementParentChain<Node>(
    of element: Node,
    maxDepth: Int = 300,
    includingSelf: Bool,
    parent: @escaping (Node) -> Node?
) -> UnfoldSequence<Node, (node: Node?, depth: Int)> {
    // Excluding self resolves the first parent immediately, even at depth zero.
    let initial = includingSelf ? element : parent(element)
    return sequence(state: (node: initial, depth: includingSelf ? 0 : 1)) { state in
        guard let current = state.node, state.depth <= maxDepth else { return nil }
        // Resolve the next parent before yielding the current node, including
        // the last allowed depth. No cycle deduplication in this source path.
        state.node = parent(current)
        state.depth += 1
        return current
    }
}
