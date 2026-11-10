import CoreGraphics
import Darwin

// Native 0x100098da8..0x100099300; geometry-derived timing, not a preset.
func cursorSpringResponse(path: CursorCubicPath, metrics: CursorPathMetrics,
    configuration: ComputerUseCursorMotionConfiguration
) -> Double {
    let target = path.segments.last!.endpoint
    let dx = target.x - path.start.x
    let dy = target.y - path.start.y
    let distance = hypot(dx, dy)
    let denominator = distance.isNaN ? 1 : max(distance, 1)
    let rawExcess = metrics.length / denominator - 1
    let excess: CGFloat = rawExcess >= 0 ? rawExcess : 0
    func unit(_ value: CGFloat) -> CGFloat {
        if !(value < 1) { return 1 } // unordered saturates high
        return value >= 0 ? value : 0
    }
    let lengthTerm = unit((metrics.length - 180) / 760)
    let excessTerm = unit(excess / 0.55)
    let totalTurnTerm = unit(metrics.absoluteTurnSum / 4.39822971502571)
    let squaredTurnTerm = unit(metrics.squaredTurnSum / 1.25)
    let magnitude = (dx * dx + dy * dy).squareRoot()
    let direction = magnitude < 0.001 ? CGPoint(x: 1, y: 0) : CGPoint(x: dx / magnitude, y: dy / magnitude)
    let pair = __sincos_stret(Double(configuration.clickAngle * 3.141592653589793 / 180))
    let dot = direction.x * CGFloat(pair.__sinval) + direction.y * CGFloat(pair.__cosval)
    let rawAlignment = (-0.08 - dot) / 0.92
    let alignment = rawAlignment.isNaN ? CGFloat(1) : max(min(rawAlignment, 1), 0)
    let complexity = (excessTerm * 0.42 + totalTurnTerm * 0.38) + squaredTurnTerm * 0.2
    let base = (lengthTerm * 0.22 + 0.42) + unit(complexity) * 0.12
    let hasJoin = path.segments.count > 1
    let unscaled = (hasJoin ? 0.04 : 0) + (alignment * 0.28 + base)
    let response = (Double(unscaled) * configuration.springResponseScaler) * (hasJoin ? 0.9 : 1)
    let upper = response < configuration.springResponseMax ? response : configuration.springResponseMax
    return configuration.springResponseMin <= upper ? upper : configuration.springResponseMin
}
