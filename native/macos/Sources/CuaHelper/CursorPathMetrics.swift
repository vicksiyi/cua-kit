import CoreGraphics
import Darwin

struct CursorPathMetrics {
    var length: CGFloat
    var squaredTurnSum: CGFloat
    var maximumTurn: CGFloat
    var absoluteTurnSum: CGFloat
    var staysInsideBounds: Bool
}

// Native 0x100098ab8: 24 samples per segment, not 24 for the whole path.
func cursorPathMetrics(_ path: CursorCubicPath, bounds: CGRect,
    configuration: ComputerUseCursorMotionConfiguration
) -> CursorPathMetrics {
    let inset = bounds.insetBy(dx: configuration.boundsMargin, dy: configuration.boundsMargin)
    var result = CursorPathMetrics(length: 0, squaredTurnSum: 0, maximumTurn: 0,
        absoluteTurnSum: 0, staysInsideBounds: inset.contains(path.start))
    var initial = path.start
    var previousAngle: CGFloat? = nil
    for segment in path.segments {
        let local = CursorCubicPath(start: initial, segments: [segment])
        var previous = initial
        for index in 1...24 {
            let point = local.sample(at: CGFloat(index) / 24).position
            result.length += hypot(point.x - previous.x, point.y - previous.y)
            if result.staysInsideBounds { result.staysInsideBounds = inset.contains(point) }
            let dx = point.x - previous.x
            let dy = point.y - previous.y
            let magnitude = (dx * dx + dy * dy).squareRoot()
            // B.LE also skips unordered comparisons.
            if magnitude > 0.01 {
                let angle = atan2(dy, dx)
                if let last = previousAngle {
                    var turn = angle - last
                    while turn > .pi { turn += -2 * .pi }
                    while turn < -.pi { turn += 2 * .pi }
                    result.squaredTurnSum += turn * turn
                    let absolute = abs(turn)
                    result.maximumTurn = result.maximumTurn <= absolute ? absolute : result.maximumTurn
                    result.absoluteTurnSum += absolute
                }
                previousAngle = angle
            }
            previous = point
        }
        initial = segment.endpoint
    }
    return result
}
