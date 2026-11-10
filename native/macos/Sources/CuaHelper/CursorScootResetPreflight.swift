import CoreGraphics
import SwiftUI

@MainActor
extension CursorScootResetStorage {
    // Native 0x10009a2b0..0x10009a390, fallback 0x10009a830. This flag
    // gates subsequent Style writes, NOT clearing the animation/scalar fields.
    func scootStyleNeedsReset(tiltAngle: () -> Angle) -> Bool {
        if cursorScootAxisAnimation != nil { return true }
        if cursorScootBaseRotationAnimation != nil { return true }
        if cursorScootStretchAnimation != nil { return true }
        if cursorScootRotationAnimation != nil { return true }
        let epsilon: CGFloat = 0.001
        if abs(cursorScootBaseRotationOffset) > epsilon { return true }
        if abs(cursorScootRotationOffset) > epsilon { return true }
        if abs(cursorScootStretchXScale + (-1)) > epsilon { return true }
        if abs(cursorScootStretchScale + (-1)) > epsilon { return true }
        if abs(cursorScootStretchPivotX - motionConfiguration.scootStretchPivotX) > epsilon { return true }
        return tiltAngle() != .zero
    }
}
