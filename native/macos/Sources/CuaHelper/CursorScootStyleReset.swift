import CoreGraphics
import Darwin
import SwiftUI

// Native 0x10009a688..0x10009a738. Preserve normalization and angle wrapping;
// this is not equivalent to assigning zero for arbitrary click angles.
func cursorScootResetAngle(clickAngle: CGFloat) -> Angle {
    let radians = clickAngle * CGFloat.pi / 180
    let pair = __sincos_stret(Double(radians))
    return cursorMotionAngle(direction: CGPoint(x: CGFloat(pair.__sinval), y: CGFloat(pair.__cosval)),
        clickAngle: clickAngle)
}

@MainActor
protocol CursorScootStyleResetStorage: CursorScootResetStorage {
    var style: ComputerUseCursorStyle { get }
}

@MainActor
extension CursorScootStyleResetStorage {
    func resetScootAnimations() {
        let needsStyleReset = scootStyleNeedsReset { style.scootTiltAngle }
        // The pivot is captured before clearing rotation, whose handler release
        // can mutate the configuration. Style itself is reloaded for each write.
        let pivot = resetScootAnimationFields()
        guard needsStyleReset else { return }
        let initialStyle = style
        initialStyle.angle = cursorScootResetAngle(clickAngle: motionConfiguration.clickAngle)
        style.scootStretchAngle = .zero
        style.scootStretchXScale = 1
        style.scootStretchScale = 1
        style.scootStretchPivotX = pivot
        style.scootTiltAngle = .zero
    }
}
