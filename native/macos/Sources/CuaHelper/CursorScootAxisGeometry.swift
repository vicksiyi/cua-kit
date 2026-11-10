import CoreGraphics
import Darwin

struct CursorScootAxisGeometry {
    let degrees: CGFloat
    let pivotX: CGFloat
}

// Native 0x100099300..0x1000993e4. Fold the axis into (-90,90],
// toggling the pivot on each half-turn. This is not atan2 alone.
func cursorScootAxisGeometry(direction: CGPoint,
    configuration: ComputerUseCursorMotionConfiguration
) -> CursorScootAxisGeometry {
    let length = (direction.x * direction.x + direction.y * direction.y).squareRoot()
    guard length >= 0.001 else {
        return CursorScootAxisGeometry(degrees: 0, pivotX: configuration.scootStretchPivotX)
    }
    var degrees = atan2(direction.y, direction.x) * 57.29577951308232
    var pivot: CGFloat = 1
    while degrees <= -90 { degrees += 180; pivot = 1 - pivot }
    while degrees > 90 { degrees += -180; pivot = 1 - pivot }
    return CursorScootAxisGeometry(degrees: degrees, pivotX: pivot)
}
