import CoreGraphics
import Darwin

// Native 0x100097f14..0x100098054. Blend the current tangent toward the
// configured click direction near the end, then normalize the result.
func cursorTerminalDirection(_ direction: CGPoint, progress: CGFloat,
    configuration: ComputerUseCursorMotionConfiguration
) -> CGPoint {
    func length(_ point: CGPoint) -> CGFloat {
        (point.x * point.x + point.y * point.y).squareRoot()
    }
    func normalized(_ point: CGPoint, fallback: CGPoint) -> CGPoint {
        let magnitude = length(point)
        if magnitude < 0.001 { return fallback }
        return CGPoint(x: point.x / magnitude, y: point.y / magnitude)
    }
    let radians = configuration.clickAngle * 3.141592653589793 / 180
    let pair = __sincos_stret(Double(radians))
    let terminal = normalized(CGPoint(x: CGFloat(pair.__sinval), y: CGFloat(pair.__cosval)),
        fallback: CGPoint(x: 1, y: 0))
    let tangent = normalized(direction, fallback: terminal)
    // Preserve the original FCSEL behavior: NaN progress selects1 here.
    let boundedProgress: CGFloat
    if progress < 1 { boundedProgress = progress >= 0 ? progress : 0 }
    else { boundedProgress = 1 }
    let start = configuration.terminalTangentBlendStart
    let relative = (boundedProgress - start) / (1 - start)
    let remaining = relative < 1 ? 1 - (relative >= 0 ? relative : 0) : 0
    let blend = 1 - CGFloat(pow(Double(remaining), 3))
    let keep = 1 - blend
    let result = CGPoint(x: terminal.x * blend + tangent.x * keep,
        y: terminal.y * blend + tangent.y * keep)
    return normalized(result, fallback: CGPoint(x: 1, y: 0))
}
