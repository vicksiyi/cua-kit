import CoreGraphics
import Darwin
import SwiftUI

// Native motion direction 0x100097bb0..0x100097c2c; the same normalization
// and angle conversion also appear in the immediate move and scoot reset.
func cursorMotionAngle(direction: CGPoint, clickAngle: CGFloat) -> Angle {
    func length() -> CGFloat {
        (direction.x * direction.x + direction.y * direction.y).squareRoot()
    }
    if length() < 0.001 { return .zero }
    let magnitude = length()
    let x: CGFloat
    let y: CGFloat
    if magnitude < 0.001 {
        x = 1
        y = 0
    } else {
        x = direction.x / magnitude
        y = direction.y / magnitude
    }
    let degrees = atan2(-y, x) * 57.29577951308232 + 90
    return .radians(Double((degrees - clickAngle) * 0.017453292519943295))
}
