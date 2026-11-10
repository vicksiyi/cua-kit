import CoreGraphics
import Darwin
import SwiftUI

struct CursorScootGeometry {
    let direction: CGPoint
    let baseRotationOffset: CGFloat
}

// Native scoot prefix 0x100096d0c..0x100096eb0. Direction has a raw
// click-direction fallback; base rotation offset is stored in degrees.
func cursorScootGeometry(start: CGPoint, target: CGPoint, currentAngle: Angle,
    configuration: ComputerUseCursorMotionConfiguration
) -> CursorScootGeometry {
    let pair = __sincos_stret(Double(configuration.clickAngle * 3.141592653589793 / 180))
    let terminal = CGPoint(x: CGFloat(pair.__sinval), y: CGFloat(pair.__cosval))
    let dx = target.x - start.x
    let dy = target.y - start.y
    let length = (dx * dx + dy * dy).squareRoot()
    let direction = length < 0.001 ? terminal : CGPoint(x: dx / length, y: dy / length)
    let resetAngle = cursorMotionAngle(direction: terminal, clickAngle: configuration.clickAngle)
    let resetDegrees = CGFloat(resetAngle.radians) * 57.29577951308232
    var offset = CGFloat(currentAngle.radians) * 57.29577951308232 - resetDegrees
    while offset > 180 { offset += -360 }
    while offset < -180 { offset += 360 }
    return CursorScootGeometry(direction: direction, baseRotationOffset: offset)
}

extension ComputerUseCursorWindow {
    func prepareScootGeometry(start: CGPoint, target: CGPoint) -> CursorScootGeometry {
        let geometry = cursorScootGeometry(start: start, target: target, currentAngle: style.angle,
            configuration: motionConfiguration)
        cursorScootBaseRotationOffset = geometry.baseRotationOffset
        return geometry
    }
}
