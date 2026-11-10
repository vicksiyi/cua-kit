import CoreGraphics
import Darwin

// Extracted native weighted score 0x10009849c..0x1000985e0.
// Candidate selection and later path processing are separate stages.
func cursorPathScore(start: CGPoint, target: CGPoint, metrics: CursorPathMetrics,
    configuration: ComputerUseCursorMotionConfiguration
) -> CGFloat {
    let dx = target.x - start.x
    let dy = target.y - start.y
    let distance = hypot(dx, dy)
    let denominator = distance.isNaN ? 1 : max(distance, 1)
    let rawExcess = metrics.length / denominator - 1
    let excess: CGFloat = rawExcess >= 0 ? rawExcess : 0
    let length = (dx * dx + dy * dy).squareRoot()
    let unit = length < 0.001 ? CGPoint(x: 1, y: 0) : CGPoint(x: dx / length, y: dy / length)
    let pair = __sincos_stret(Double(configuration.clickAngle * 3.141592653589793 / 180))
    let dot = CGFloat(pair.__sinval) * unit.x + CGFloat(pair.__cosval) * unit.y
    let rawAlignment = (-0.08 - dot) / 0.92
    let positive: CGFloat = rawAlignment >= 0 ? rawAlignment : 0
    // FCSEL MI sends unordered alignment to the full penalty.
    let alignment: CGFloat = rawAlignment < 1 ? positive * 90 : 90
    var score = metrics.length + excess * 320
    score += metrics.squaredTurnSum * 140
    score += metrics.maximumTurn * 180
    score += metrics.absoluteTurnSum * 18
    score += alignment
    return (metrics.staysInsideBounds ? 0 : 45) + score
}
