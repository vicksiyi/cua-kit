import CoreGraphics

struct ScoredCursorPath {
    let path: CursorCubicPath
    let metrics: CursorPathMetrics
    let score: CGFloat
}

// Native 0x100098650..0x100098ab8: prefer the in-bounds pool when
// nonempty, then strictly smaller scores. Equal/unordered scores keep first.
func selectCursorPath(_ candidates: [ScoredCursorPath]) -> ScoredCursorPath? {
    let inside = candidates.filter { $0.metrics.staysInsideBounds }
    let pool = inside.isEmpty ? candidates : inside
    guard var best = pool.first else { return nil }
    for candidate in pool.dropFirst() where candidate.score < best.score {
        best = candidate
    }
    return best
}

// Joins the recovered geometric stages of 0x100098058. Does not start
// animations, mutate window ownership or authorize interaction.
func planCursorPath(start: CGPoint, target: CGPoint, bounds: CGRect,
    configuration: ComputerUseCursorMotionConfiguration
) -> CursorCubicPath {
    if let straight = cursorStraightPath(start: start, target: target, configuration: configuration) {
        return straight
    }
    let candidates = cursorPathCandidates(start: start, target: target, configuration: configuration)
    let measured = candidates.map { path in
        let metrics = cursorPathMetrics(path, bounds: bounds, configuration: configuration)
        return ScoredCursorPath(path: path, metrics: metrics,
            score: cursorPathScore(start: path.start, target: path.segments.last!.endpoint,
                metrics: metrics, configuration: configuration))
    }
    guard let chosen = selectCursorPath(measured) else {
        preconditionFailure("Native long-distance planning requires a candidate")
    }
    return chosen.path
}
