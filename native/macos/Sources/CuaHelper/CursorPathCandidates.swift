import CoreGraphics
import Darwin

// Native candidate construction 0x10009d6bc..0x10009df30.
// Ranking against bounds is a separate, still unreconstructed stage.
func cursorPathCandidates(start: CGPoint, target: CGPoint,
    configuration: ComputerUseCursorMotionConfiguration
) -> [CursorCubicPath] {
    precondition(configuration.candidateCount >= 0)
    var candidates = cursorPathSeeds(start: start, target: target, configuration: configuration)
    let first = candidates[0].segments[0]
    let dx = target.x - start.x
    let dy = target.y - start.y
    let distance = hypot(dx, dy)
    let length = (dx * dx + dy * dy).squareRoot()
    let unit = length < 0.001 ? CGPoint(x: 1, y: 0) : CGPoint(x: dx / length, y: dy / length)
    let radians = configuration.clickAngle * 3.141592653589793 / 180
    let pair = __sincos_stret(Double(radians))
    let cross = CGFloat(pair.__cosval) * unit.x - CGFloat(pair.__sinval) * unit.y
    let sign: CGFloat = cross >= 0 ? 1 : -1
    let normal = CGPoint(x: -unit.y * sign, y: unit.x * sign)
    let middle = CGPoint(x: (start.x + target.x) * 0.5, y: (start.y + target.y) * 0.5)
    // Native stores 0.16 times the unscaled first control displacement.
    let handle = cursorPathHandleLength(distance: distance, factor: configuration.startHandle)
    let bias = CGPoint(x: (CGFloat(pair.__sinval) * handle) * 0.16,
                       y: (CGFloat(pair.__cosval) * handle) * 0.16)
    func limited(_ value: CGFloat, floor: CGFloat, ceiling: CGFloat) -> CGFloat {
        value < ceiling ? (value.isNaN ? floor : max(value, floor)) : ceiling
    }
    let arc = limited(distance * configuration.arcSize, floor: 50, ceiling: 520)
    let flow = limited(distance * configuration.arcFlow, floor: 38, ceiling: 440)
    let flowUnit = length < 0.001 ? CGPoint.zero : CGPoint(x: dx / length, y: dy / length)
    for arcScale: CGFloat in [0.55, 0.8, 1.05] {
        let offset = arc * arcScale
        let positive = CGPoint(x: bias.x + (middle.x + normal.x * offset),
                               y: bias.y + (middle.y + normal.y * offset))
        let negative = CGPoint(x: bias.x + (middle.x - normal.x * offset),
                               y: bias.y + (middle.y - normal.y * offset))
        for flowScale: CGFloat in [0.65, 1, 1.35] {
            let amount = flow * flowScale
            let tangent = CGPoint(x: flowUnit.x * amount, y: flowUnit.y * amount)
            for join in [positive, negative] {
                candidates.append(CursorCubicPath(start: start, segments: [
                    .init(endpoint: join, control1: first.control1,
                        control2: CGPoint(x: join.x - tangent.x, y: join.y - tangent.y)),
                    .init(endpoint: target,
                        control1: CGPoint(x: join.x + tangent.x, y: join.y + tangent.y),
                        control2: first.control2)
                ]))
            }
        }
    }
    return Array(candidates.prefix(configuration.candidateCount))
}
