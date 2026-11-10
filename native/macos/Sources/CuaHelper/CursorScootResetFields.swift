import CoreGraphics

// Extracted live-field boundary for 0x10009a394..0x10009a670. The native
// dirty-state preflight and subsequent Style updates surround this phase.
@MainActor
protocol CursorScootResetStorage: CursorWindowAnimationStorage {
    var motionConfiguration: ComputerUseCursorMotionConfiguration { get }
    var cursorScootBaseRotationOffset: CGFloat { get set }
    var cursorScootAxisRotation: CGFloat { get set }
    var cursorScootStretchXScale: CGFloat { get set }
    var cursorScootStretchScale: CGFloat { get set }
    var cursorScootStretchPivotX: CGFloat { get set }
    var cursorScootRotationOffset: CGFloat { get set }
}

@MainActor
extension CursorScootResetStorage {
    @discardableResult
    func resetScootAnimationFields() -> CGFloat {
        stopAndClearCursorScootAnimation(self, at: \.cursorScootBaseRotationAnimation)
        cursorScootBaseRotationOffset = 0
        stopAndClearCursorScootAnimation(self, at: \.cursorScootAxisAnimation)
        cursorScootAxisRotation = 0
        stopAndClearCursorScootAnimation(self, at: \.cursorScootStretchAnimation)
        cursorScootStretchXScale = 1
        cursorScootStretchScale = 1
        let pivot = motionConfiguration.scootStretchPivotX
        cursorScootStretchPivotX = pivot
        stopAndClearCursorScootAnimation(self, at: \.cursorScootRotationAnimation)
        cursorScootRotationOffset = 0
        return pivot
    }
}
