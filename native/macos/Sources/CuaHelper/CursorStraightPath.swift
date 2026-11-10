import CoreGraphics
import Darwin

// Native planner 0x100098058 short-distance branch. Returning nil leaves
// candidate generation to the original long-distance planner, still pending.
func cursorStraightPath(start: CGPoint, target: CGPoint,
    configuration: ComputerUseCursorMotionConfiguration
) -> CursorCubicPath? {
    // CGPoint.distance(from:) uses hypot, unlike CGPoint.length's sqrt sum.
    let distance = hypot(target.x - start.x, target.y - start.y)
    guard distance <= configuration.straightPathDistanceThreshold else { return nil }
    let dx = target.x - start.x
    let dy = target.y - start.y
    return CursorCubicPath(start: start, segments: [
        .init(endpoint: target,
            control1: CGPoint(x: start.x + dx / 3, y: start.y + dy / 3),
            control2: CGPoint(x: start.x + dx * (2.0 / 3.0), y: start.y + dy * (2.0 / 3.0)))
    ])
}
