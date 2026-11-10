import Animation
import CoreGraphics

// Extracted storage boundary for native Cursor.Window fields 4...9. The
// concrete Window will provide these fields; no second registry is introduced.
@MainActor
protocol CursorWindowAnimationStorage: AnyObject {
    var cursorMotionProgressAnimation: SpringAnimation<CGFloat>? { get set }
    var cursorScootPositionAnimation: SpringAnimation<CGPoint>? { get set }
    var cursorScootBaseRotationAnimation: SpringAnimation<CGFloat>? { get set }
    var cursorScootAxisAnimation: SpringAnimation<CGFloat>? { get set }
    var cursorScootStretchAnimation: SpringAnimation<CGFloat>? { get set }
    var cursorScootRotationAnimation: SpringAnimation<CGFloat>? { get set }
}

@MainActor
extension CursorWindowAnimationStorage {
    // Same recovered reset composition, now bound to actual native animation
    // types and live owner fields rather than independently supplied probes.
    func resetMotionAnimations() {
        resetCursorMotionAnimations(
            progress: { self.cursorMotionProgressAnimation }, progressState: { $0.state },
            stopProgressImmediately: { $0.stop(immediately: true) },
            clearProgress: { self.cursorMotionProgressAnimation = nil },
            position: { self.cursorScootPositionAnimation },
            clearPositionCallback: { $0.eventHandler = nil }, positionState: { $0.state },
            stopPositionImmediately: { $0.stop(immediately: true) },
            clearPosition: { self.cursorScootPositionAnimation = nil })
    }
}
