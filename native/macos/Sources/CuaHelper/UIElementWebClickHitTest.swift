import CoreGraphics

// 0x1007b7ca4: walk upward from the hit (including itself), comparing each
// AX reference to the intended target. Reuse the original 300-depth iterator,
// including its parent lookahead and lack of cycle deduplication.
func uiElementHitDescendsFromTarget<Node>(
    hit: Node, target: Node,
    parent: @escaping (Node) -> Node?,
    equal: (Node, Node) -> Bool
) -> Bool {
    for node in uiElementParentChain(of: hit, maxDepth: 300, includingSelf: true, parent: parent) {
        if equal(node, target) { return true }
    }
    return false
}

// 0x1007b8444..<0x1007b85fc. Errors from the no-argument clickablePoint
// or app-level hit test are suppressed to false in this probe. This is not
// the simulated-click point resolver, which propagates errors instead.
func uiElementWebClickHitsTarget<Node>(
    target: Node,
    clickablePoint: () async throws -> CGPoint?,
    hitTest: (CGPoint) throws -> Node?,
    parent: @escaping (Node) -> Node?,
    equal: (Node, Node) -> Bool
) async -> Bool {
    guard let point = try? await clickablePoint(), let hit = try? hitTest(point) else { return false }
    return uiElementHitDescendsFromTarget(hit: hit, target: target, parent: parent, equal: equal)
}
