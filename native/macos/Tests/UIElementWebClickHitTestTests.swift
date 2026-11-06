import CoreGraphics

@main struct UIElementWebClickHitTestTests {
    enum Failure: Error { case probe }
    static func main() async {
        for pointMode in 0..<3 {
            for hitMode in 0..<3 {
                var hits = 0, parents = 0
                let result = await uiElementWebClickHitsTarget(target: 0,
                    clickablePoint: {
                        if pointMode == 0 { throw Failure.probe }
                        return pointMode == 1 ? nil : CGPoint(x: 1, y: 2)
                    }, hitTest: { point -> Int? in
                        precondition(point == CGPoint(x: 1, y: 2)); hits += 1
                        if hitMode == 0 { throw Failure.probe }
                        return hitMode == 1 ? nil : 2
                    }, parent: { node -> Int? in parents += 1; return node > 0 ? node - 1 : nil }, equal: ==)
                precondition(result == (pointMode == 2 && hitMode == 2))
                precondition(hits == (pointMode == 2 ? 1 : 0))
                precondition(parents == (result ? 3 : 0))
            }
        }
        var order: [String] = []
        precondition(uiElementHitDescendsFromTarget(hit: 7, target: 7,
            parent: { node in order.append("parent"); return nil },
            equal: { lhs, rhs in order.append("equal"); return lhs == rhs }))
        precondition(order == ["parent", "equal"])
        // At depth 300 the target is still yielded; depth 301 is not compared.
        for depth in [300, 301] {
            var comparisons = 0, reads = 0
            let result = uiElementHitDescendsFromTarget(hit: 0, target: depth,
                parent: { node in reads += 1; return node + 1 },
                equal: { lhs, rhs in comparisons += 1; return lhs == rhs })
            precondition(result == (depth == 300) && comparisons == 301 && reads == 301)
        }
        // The walk starts from hit, not target; a target descendant isn't a match.
        precondition(!uiElementHitDescendsFromTarget(hit: 2, target: 3,
            parent: { $0 > 0 ? $0 - 1 : nil }, equal: ==))
        print("Web click hit probe preserves error suppression, ancestry direction and depth")
    }
}
