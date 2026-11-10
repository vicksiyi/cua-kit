import CoreGraphics
import Darwin

// First two candidates in 0x10009d6bc. Later arc candidates and ranking
// remain separate stages; these seeds are not a complete planner.
func cursorPathSeeds(start: CGPoint, target: CGPoint,
    configuration: ComputerUseCursorMotionConfiguration
) -> [CursorCubicPath] {
    let distance = hypot(target.x - start.x, target.y - start.y)
    let startHandle = cursorPathHandleLength(distance: distance, factor: configuration.startHandle)
    let endHandle = cursorPathHandleLength(distance: distance, factor: configuration.endpointHandle)
    let radians = configuration.clickAngle * 3.141592653589793 / 180
    let pair = __sincos_stret(Double(radians))
    let x = CGFloat(pair.__sinval)
    let y = CGFloat(pair.__cosval)
    func path(scale: CGFloat) -> CursorCubicPath {
        let first = startHandle * scale
        let last = endHandle * scale
        return CursorCubicPath(start: start, segments: [.init(endpoint: target,
            control1: CGPoint(x: start.x + x * first, y: start.y + y * first),
            control2: CGPoint(x: target.x - x * last, y: target.y - y * last))])
    }
    return [path(scale: 1), path(scale: 0.65)]
}

func cursorPathHandleLength(distance: CGFloat, factor: CGFloat) -> CGFloat {
        let raw = distance * factor
        let cap = distance * 0.9
        let limited: CGFloat
        if !(raw < 640) {
            if !(cap < 640) { return 640 }
            limited = cap
        } else {
            limited = cap < raw ? cap : raw
        }
        // FMAXNM chooses the numeric operand when limited is NaN.
        return limited.isNaN ? 48 : max(limited, 48)
    }
